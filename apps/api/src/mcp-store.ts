import type { SupabaseClient } from "@supabase/supabase-js";
import { BRASILIA_OFFSET_MIN, buildDayPlan, fingerprintsFor, parseDraft, summarizeForMemory, trackById, type Scenes, type ContentDraft, type ContentFormat, type EditChoices, type Pillar, type PostMetrics, type ProjectInfo, type RoutineBlock } from "@postai/domain";
import { supabaseMemory } from "./adapters";
import type { McpContent, McpContext, McpRequest, McpTake, McpPost, McpProfile, McpRecording, McpScript, McpStore } from "./mcp-tools";
import type { FilmableProof, NewProfile, RealCase } from "./mcp-profiles";

type ContentRow = { id: string; format: string; pillar_slug: string | null; title: string; plan_date: string | null; structured_payload: Record<string, unknown> | null };
const COLS = "id, format, pillar_slug, title, plan_date, structured_payload";

const asProject = (p: Record<string, unknown> | null) => (p?.project ?? null) as ProjectInfo | null;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const addDays = (dateKey: string, n: number) => new Date(Date.parse(`${dateKey}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** início/fim de um dia de Brasília em UTC (para achar missões já criadas naquele dia) */
const brtDayRange = (dateKey: string) => {
  const start = new Date(Date.parse(`${dateKey}T00:00:00Z`) - BRASILIA_OFFSET_MIN * 60_000);
  return [start.toISOString(), new Date(start.getTime() + 86_400_000).toISOString()] as const;
};
const WRITE_ROLES = ["owner", "editor"];
const PENDING_WINDOW_DAYS = 30;

/** Música usada: a escolhida pelo criador, a da direção ou o automático. */
function musicLabel(edit: EditChoices | null, draft: ContentDraft | undefined): string | null {
  const choice = edit?.music ?? "auto";
  if (choice === "none") return "sem música";
  const track = trackById(choice) ?? (choice === "auto" && draft?.direcao?.musica ? trackById(draft.direcao.musica.id) : undefined);
  if (track) return track.title;
  return choice === "auto" ? "automática" : `clima ${choice}`;
}

/**
 * Store do conector MCP. Usa a chave de serviço, então TODA consulta filtra pelo workspace do link
 * (o token já foi conferido antes de chegar aqui).
 */
export function supabaseMcpStore(db: SupabaseClient, workspaceId: string, userId: string): McpStore {
  const memory = supabaseMemory(db, userId);
  /** roteiros enviados pelo assistente que o app ainda não abriu (mais novos primeiro) — contam como roteiro feito */
  const pendingDrafts = async (days = PENDING_WINDOW_DAYS): Promise<{ contentItemId: string; draft: ContentDraft; createdAt: string }[]> => {
    const { data, error } = await db.from("assistant_drafts").select("content_item_id, draft, created_at").eq("workspace_id", workspaceId).is("consumed_at", null)
      .gte("created_at", daysAgo(days)).order("created_at", { ascending: false }).limit(60);
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    return (data ?? []).flatMap((r) => {
      const parsed = parseDraft(r.draft);
      const id = r.content_item_id as string;
      if (!parsed.ok || seen.has(id)) return [];
      seen.add(id);
      return [{ contentItemId: id, draft: parsed.draft, createdAt: r.created_at as string }];
    });
  };
  /** Dia planejado antes da cena dirigida: a missão de B-roll da empresa ganha um conteúdo (formato cena de apoio). */
  const backfillBroll = async (from: string, to: string, date: string, pillars: Pillar[]): Promise<number> => {
    const { data, error } = await db.from("recording_tasks").select("id, title, scheduled_for").eq("workspace_id", workspaceId).eq("kind", "broll")
      .eq("optional", false).is("content_item_id", null).gte("scheduled_for", from).lt("scheduled_for", to);
    if (error) throw new Error(error.message);
    const slug = pillars.find((p) => p.slug === "demonstracao")?.slug ?? pillars[0]?.slug ?? "";
    for (const t of data ?? []) {
      const id = crypto.randomUUID();
      const ci = await db.from("content_items").insert({ id, workspace_id: workspaceId, pillar_slug: slug, plan_date: date, scheduled_for: t.scheduled_for, format: "broll", title: t.title, status: "planned", structured_payload: {} });
      if (ci.error) throw new Error(ci.error.message);
      const up = await db.from("recording_tasks").update({ content_item_id: id, updated_at: new Date().toISOString() }).eq("id", t.id);
      if (up.error) throw new Error(up.error.message);
    }
    return data?.length ?? 0;
  };
  const withScript = async (rows: ContentRow[]): Promise<McpContent[]> => {
    const ids = rows.map((r) => r.id);
    const [{ data }, pend] = await Promise.all([
      ids.length ? db.from("scripts").select("content_item_id").in("content_item_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("assistant_drafts").select("content_item_id").in("content_item_id", ids).is("consumed_at", null) : Promise.resolve({ data: [] }),
    ]);
    const scripted = new Set((data ?? []).map((s: { content_item_id: string }) => s.content_item_id));
    const pending = new Set((pend.data ?? []).map((s: { content_item_id: string }) => s.content_item_id));
    return rows.map((r) => ({
      id: r.id, format: r.format, pillarSlug: r.pillar_slug ?? "", title: r.title, date: r.plan_date ?? "", hasScript: scripted.has(r.id), pendingDraft: pending.has(r.id),
      project: asProject(r.structured_payload),
    }));
  };
  const store: McpStore = {
    async contentsOn(date) {
      const { data, error } = await db.from("content_items").select(COLS).eq("workspace_id", workspaceId).eq("plan_date", date).order("scheduled_for");
      if (error) throw new Error(error.message);
      return withScript((data ?? []) as ContentRow[]);
    },
    async recordingStatus(contentId): Promise<McpRecording> {
      const [takes, renders] = await Promise.all([
        db.from("takes").select("segment_index, tags, media_files(state)").eq("workspace_id", workspaceId).eq("content_item_id", contentId),
        db.from("render_jobs").select("status, error, plan, result, created_at").eq("workspace_id", workspaceId).eq("content_item_id", contentId).order("created_at", { ascending: false }).limit(3),
      ]);
      const err = takes.error ?? renders.error;
      if (err) throw new Error(err.message);
      type T = { segment_index: number | null; tags: string[] | null; media_files: { state: string } | null };
      return {
        takes: ((takes.data ?? []) as unknown as T[])
          .filter((t) => !(t.tags ?? []).includes("descartado"))
          .map((t) => ({ segmentIndex: t.segment_index, synced: t.media_files?.state === "uploaded_original" })),
        renders: (renders.data ?? []).map((r) => ({
          status: r.status as string, error: (r.error as string | null) ?? null, createdAt: r.created_at as string,
          variant: ((r.plan as { variant?: string } | null)?.variant ?? "completo"), warnings: ((r.result as { warnings?: string[] } | null)?.warnings ?? []),
        })),
      };
    },
    async takes(contentId): Promise<McpTake[]> {
      const { data, error } = await db.from("takes").select("id, segment_index, created_at, tags, favorite, camera, media_files(state, duration_ms, width, height)")
        .eq("workspace_id", workspaceId).eq("content_item_id", contentId).is("deleted_at", null).order("created_at").limit(100);
      if (error) throw new Error(error.message);
      type T = { id: string; segment_index: number | null; created_at: string; tags: string[] | null; favorite: boolean; camera: string | null; media_files: { state: string; duration_ms: number | null; width: number | null; height: number | null } | null };
      return ((data ?? []) as unknown as T[]).map((t) => ({
        id: t.id, segmentIndex: t.segment_index, createdAt: t.created_at, discarded: (t.tags ?? []).includes("descartado"), chosen: (t.tags ?? []).includes("escolhido"), synced: t.media_files?.state === "uploaded_original",
        favorite: t.favorite, camera: t.camera, durationMs: t.media_files?.duration_ms ?? null, width: t.media_files?.width ?? null, height: t.media_files?.height ?? null,
      }));
    },
    async ownMusic() {
      const { data, error } = await db.from("musicas_proprias").select("id, titulo, comercial, storage_key").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map((m) => ({ id: m.id as string, titulo: m.titulo as string, comercial: Boolean(m.comercial), storageKey: m.storage_key as string }));
    },
    async musicFavorites() {
      const { data, error } = await db.from("musicas_favoritas").select("track_id").eq("workspace_id", workspaceId).limit(200);
      // 42P01 = tabela ainda não criada (migration pendente): segue sem favoritas
      if (error?.code === "42P01") return [];
      if (error) throw new Error(error.message);
      return [...new Set((data ?? []).map((r) => r.track_id as string))];
    },
    async mediaLibrary({ categoria, favoritas, limite }) {
      let q = db.from("takes").select("id, segment_index, created_at, tags, favorite, camera, category, content_item_id, meta, media_files(state, duration_ms, width, height)")
        .eq("workspace_id", workspaceId).is("deleted_at", null);
      if (categoria === "broll") q = q.eq("category", "broll");
      else if (categoria === "prova") q = q.or("category.eq.patrimonio,meta->>shot.not.is.null");
      else if (categoria === "fala") q = q.or("category.is.null,category.neq.broll").is("meta->>shot", null);
      if (favoritas) q = q.eq("favorite", true);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limite * 2);
      if (error) throw new Error(error.message);
      type T = { id: string; segment_index: number | null; created_at: string; tags: string[] | null; favorite: boolean; camera: string | null; category: string | null; content_item_id: string | null; meta: { capitulo?: string | null } | null; media_files: { state: string; duration_ms: number | null; width: number | null; height: number | null } | null };
      return ((data ?? []) as unknown as T[]).filter((t) => !(t.tags ?? []).includes("descartado")).slice(0, limite).map((t) => ({
        id: t.id, segmentIndex: t.segment_index, createdAt: t.created_at, discarded: false, chosen: (t.tags ?? []).includes("escolhido"), synced: t.media_files?.state === "uploaded_original",
        favorite: t.favorite, camera: t.camera, durationMs: t.media_files?.duration_ms ?? null, width: t.media_files?.width ?? null, height: t.media_files?.height ?? null,
        category: t.category ?? "livre", contentId: t.content_item_id, tags: (t.tags ?? []).filter((g) => g !== "escolhido"), capitulo: t.meta?.capitulo ?? null,
      }));
    },
    async creatorRequests(contentId): Promise<McpRequest[]> {
      let q = db.from("pedidos_diretor").select("id, content_item_id, texto, resposta, created_at").eq("workspace_id", workspaceId);
      if (contentId) q = q.eq("content_item_id", contentId);
      const { data, error } = await q.order("respondido_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(20);
      if (error?.code === "42P01") return [];
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id as string, contentId: r.content_item_id as string, texto: r.texto as string, createdAt: r.created_at as string, resposta: (r.resposta as string | null) ?? null }));
    },
    async answerRequest(id, resposta) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
      const { data, error } = await db.from("pedidos_diretor").update({ resposta, respondido_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", id).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    async saveEditProposal(contentId, edit, motivo) {
      const { error } = await db.from("propostas_edicao").insert({ workspace_id: workspaceId, content_item_id: contentId, edit, motivo });
      if (error) throw new Error(error.message);
    },
    async readScript(contentId): Promise<McpScript> {
      const [script, content, pending] = await Promise.all([
        db.from("scripts").select("draft").eq("workspace_id", workspaceId).eq("content_item_id", contentId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("content_items").select("structured_payload").eq("workspace_id", workspaceId).eq("id", contentId).maybeSingle(),
        db.from("assistant_drafts").select("draft, created_at").eq("workspace_id", workspaceId).eq("content_item_id", contentId).is("consumed_at", null).order("created_at", { ascending: false }).limit(1),
      ]);
      const sp = (content.data?.structured_payload ?? {}) as Record<string, unknown>;
      const box = pending.data?.[0] ?? null;
      const boxDraft = box?.draft as { tipo?: string; takes?: unknown } | null | undefined;
      return {
        draft: (script.data?.draft ?? null) as ContentDraft | null,
        edit: (sp.edit ?? null) as EditChoices | null,
        metrics: (sp.metrics ?? null) as PostMetrics | null,
        postedAt: typeof sp.posted_at === "string" ? sp.posted_at : null,
        pendingFromAssistant: Boolean(box),
        // o que o assistente enviou e o app ainda não abriu (roteiro ou cenas) — para conferir antes da gravação
        pending: box ? { sentAt: box.created_at as string, draft: boxDraft?.tipo === "cenas" ? null : (box.draft as ContentDraft), scenes: boxDraft?.tipo === "cenas" ? (boxDraft.takes as Scenes) : null } : null,
        scenes: Array.isArray(sp.cenas) ? (sp.cenas as Scenes) : null,
      };
    },
    async planDays(startDate, days) {
      const out: { date: string; created: boolean; items: McpContent[] }[] = [];
      const [pillarRows, blockRows, recentRows] = await Promise.all([
        db.from("content_pillars").select("slug, name, target_percent, active").eq("workspace_id", workspaceId),
        db.from("routine_blocks").select("id, weekday, start_time, title, content_hint, optional, default_format").eq("workspace_id", workspaceId),
        db.from("content_items").select("pillar_slug").eq("workspace_id", workspaceId).neq("format", "broll").order("plan_date", { ascending: false }).limit(30),
      ]);
      const err = pillarRows.error ?? blockRows.error ?? recentRows.error;
      if (err) throw new Error(err.message);
      const pillars: Pillar[] = (pillarRows.data ?? []).map((p) => ({ slug: p.slug, name: p.name, targetPercent: Number(p.target_percent), active: p.active }));
      const routine: RoutineBlock[] = (blockRows.data ?? []).map((b) => ({
        id: b.id, weekday: b.weekday, startTime: String(b.start_time).slice(0, 5), title: b.title, contentHint: b.content_hint, optional: b.optional, format: b.default_format as ContentFormat,
      }));
      const history = (recentRows.data ?? []).map((r) => r.pillar_slug as string).filter(Boolean).reverse();
      const business = (await store.profile()).kind === "empresa";
      for (let i = 0; i < days; i++) {
        const date = addDays(startDate, i);
        const [from, to] = brtDayRange(date);
        const tasks = await db.from("recording_tasks").select("id").eq("workspace_id", workspaceId).gte("scheduled_for", from).lt("scheduled_for", to).limit(1);
        if (tasks.error) throw new Error(tasks.error.message);
        const existing = await store.contentsOn(date);
        // dia já planejado (pelo app ou antes): fica como está — só a empresa ganha a cena de apoio que faltava
        if (existing.length || tasks.data?.length) {
          const added = business ? await backfillBroll(from, to, date, pillars) : 0;
          out.push({ date, created: false, items: added ? await store.contentsOn(date) : existing });
          continue;
        }
        const plan = buildDayPlan({ date: new Date(0), dateKey: date, utcOffsetMinutes: BRASILIA_OFFSET_MIN, workspaceId, routine, pillars, recentPillarSlugs: history, newId: () => crypto.randomUUID(), now: new Date().toISOString(), directedBroll: business });
        history.push(...plan.contentItems.filter((c) => c.format !== "broll").map((c) => c.pillarSlug));
        if (plan.contentItems.length) {
          const ci = await db.from("content_items").insert(plan.contentItems.map((c) => ({
            id: c.id, workspace_id: workspaceId, pillar_slug: c.pillarSlug, plan_date: c.date, scheduled_for: c.scheduledFor, format: c.format, title: c.title, status: c.status, structured_payload: {},
          })));
          if (ci.error) throw new Error(ci.error.message);
        }
        if (plan.tasks.length) {
          const rt = await db.from("recording_tasks").insert(plan.tasks.map((t) => ({
            id: t.id, workspace_id: workspaceId, content_item_id: t.contentItemId, scheduled_for: t.scheduledFor, title: t.title, kind: t.kind, hint: t.hint,
            suggested_duration_seconds: t.suggestedDurationSeconds, optional: t.optional, status: t.status, updated_at: t.updatedAt,
          })));
          if (rt.error) throw new Error(rt.error.message);
        }
        out.push({ date, created: true, items: await store.contentsOn(date) });
      }
      return out;
    },
    async pillarCounts(days) {
      const [scripts, pending] = await Promise.all([db.from("scripts").select("content_item_id").eq("workspace_id", workspaceId).gte("created_at", daysAgo(days)), pendingDrafts(days)]);
      if (scripts.error) throw new Error(scripts.error.message);
      const ids = [...new Set([...(scripts.data ?? []).map((r) => r.content_item_id as string), ...pending.map((p) => p.contentItemId)].filter(Boolean))];
      if (!ids.length) return {};
      const items = await db.from("content_items").select("pillar_slug").eq("workspace_id", workspaceId).in("id", ids);
      if (items.error) throw new Error(items.error.message);
      const counts: Record<string, number> = {};
      for (const r of items.data ?? []) if (r.pillar_slug) counts[r.pillar_slug] = (counts[r.pillar_slug] ?? 0) + 1;
      return counts;
    },
    async recentTopics(days) {
      const { data, error } = await db.from("scripts").select("draft, content_item_id").eq("workspace_id", workspaceId).gte("created_at", daysAgo(days)).order("created_at", { ascending: false }).limit(60);
      if (error) throw new Error(error.message);
      const pending = await pendingDrafts(days);
      return [
        ...pending.map((p) => ({ topic: p.draft.topic, contentItemId: p.contentItemId as string | null })),
        ...(data ?? []).map((r) => ({ topic: String((r.draft as { topic?: string } | null)?.topic ?? ""), contentItemId: (r.content_item_id as string | null) ?? null })),
      ].filter((r) => r.topic);
    },
    async saveImprovement(i) {
      const { data, error } = await db.from("melhorias").insert({ workspace_id: workspaceId, user_id: userId, ...i }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    async improvements() {
      const { data, error } = await db.from("melhorias").select("id, titulo, prioridade, status, issue_number, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []).map((m) => ({ id: m.id, titulo: m.titulo, prioridade: m.prioridade, status: m.status, issueNumber: m.issue_number, createdAt: m.created_at }));
    },
    async content(id) {
      const { data, error } = await db.from("content_items").select(COLS).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? (await withScript([data as ContentRow]))[0]! : null;
    },
    profile: () => memory.profile(workspaceId),
    pillarName: (slug) => memory.pillarName(workspaceId, slug),
    async recentFingerprints() {
      const [saved, pending] = await Promise.all([memory.recentFingerprints(workspaceId), pendingDrafts()]);
      return [...pending.flatMap((p) => fingerprintsFor(p.draft).map((f) => ({ ...f, contentItemId: p.contentItemId, createdAt: p.createdAt }))), ...saved];
    },
    async recentSummaries() {
      const [saved, pending] = await Promise.all([memory.recentSummaries(workspaceId), pendingDrafts()]);
      return [...pending.map((p) => `${summarizeForMemory(p.draft)} (enviado pelo assistente, aguardando o app)`), ...saved].slice(0, 15);
    },
    async saveDraft(contentId, draft) {
      const { error } = await db.from("assistant_drafts").insert({ workspace_id: workspaceId, content_item_id: contentId, draft, source: "mcp" });
      if (error) throw new Error(error.message);
    },
    async saveScenes(contentId, scenes) {
      // mesma caixa de entrada do app; o app reconhece pelo "tipo"
      const { error } = await db.from("assistant_drafts").insert({ workspace_id: workspaceId, content_item_id: contentId, draft: { tipo: "cenas", takes: scenes }, source: "mcp" });
      if (error) throw new Error(error.message);
    },
    async strategy() {
      const [pillars, blocks] = await Promise.all([
        db.from("content_pillars").select("slug, name, target_percent, active").eq("workspace_id", workspaceId),
        db.from("routine_blocks").select("weekday, start_time, title, default_format").eq("workspace_id", workspaceId).order("weekday").order("start_time"),
      ]);
      if (pillars.error ?? blocks.error) throw new Error((pillars.error ?? blocks.error)!.message);
      return {
        pillars: (pillars.data ?? []).filter((p) => p.active).map((p) => ({ slug: p.slug, name: p.name, targetPercent: Number(p.target_percent) })),
        routine: (blocks.data ?? []).map((b) => ({ weekday: b.weekday, startTime: String(b.start_time).slice(0, 5), title: b.title, format: b.default_format })),
      };
    },
    async posts(limit) {
      // posts = conteúdos postados (hora registrada), com números anotados no app ou importados pelo assistente
      const imported = await db.from("post_metrics").select("content_item_id, metrics").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(limit);
      if (imported.error) throw new Error(imported.error.message);
      const importedBy = new Map((imported.data ?? []).map((r) => [r.content_item_id as string, r.metrics as PostMetrics]));
      const ids = [...importedBy.keys()];
      const filter = ["structured_payload->>posted_at.not.is.null", "structured_payload->>metrics.not.is.null", ...(ids.length ? [`id.in.(${ids.join(",")})`] : [])].join(",");
      const { data, error } = await db.from("content_items").select(COLS).eq("workspace_id", workspaceId).or(filter).order("plan_date", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ContentRow[];
      const scripts = rows.length ? await db.from("scripts").select("content_item_id, draft, updated_at").in("content_item_id", rows.map((r) => r.id)).order("updated_at", { ascending: false }) : { data: [] };
      const draftBy = new Map<string, ContentDraft>();
      for (const sc of (scripts.data ?? []) as { content_item_id: string; draft: ContentDraft }[]) if (!draftBy.has(sc.content_item_id)) draftBy.set(sc.content_item_id, sc.draft);
      return rows.map((r): McpPost => {
        const p = r.structured_payload ?? {};
        const typed = (p.metrics ?? null) as PostMetrics | null;
        const fromAssistant = importedBy.get(r.id) ?? null;
        // vale o número mais recente (digitado no app ou importado)
        const metrics = !typed ? fromAssistant : !fromAssistant ? typed : fromAssistant.updatedAt > typed.updatedAt ? fromAssistant : typed;
        const draft = draftBy.get(r.id);
        const edit = (p.edit ?? null) as EditChoices | null;
        return {
          id: r.id, title: r.title, pillarSlug: r.pillar_slug ?? "", format: r.format, date: r.plan_date ?? "",
          postedAt: typeof p.posted_at === "string" ? p.posted_at : null,
          postedTo: Array.isArray(p.posted_to) ? (p.posted_to as string[]) : [],
          metrics,
          hook: draft ? (draft.hook_options[Number(p.selected_hook ?? 0)] ?? draft.hook_options[0] ?? null) : null,
          music: musicLabel(edit, draft),
        };
      });
    },
    async saveMetrics(contentId, metrics) {
      const { error } = await db.from("post_metrics").upsert({ content_item_id: contentId, workspace_id: workspaceId, metrics, source: metrics.source ?? "assistente", updated_at: new Date().toISOString() }, { onConflict: "content_item_id" });
      if (error) throw new Error(error.message);
    },
    async updateProfile(p, pillars) {
      const cur = await db.from("creator_profiles").select("tone").eq("workspace_id", workspaceId).single();
      if (cur.error) throw new Error(cur.error.message);
      const tone = { ...((cur.data.tone ?? {}) as Record<string, unknown>), kind: p.kind ?? "pessoal", business: p.business ?? null, extras: p.extras ?? null };
      const up = await db.from("creator_profiles").update({
        display_name: p.displayName, handle: p.handle, positioning: p.positioning, signature: p.signature, closing_phrase: p.closingPhrase, voice_rules: p.voiceRules, tone, updated_at: new Date().toISOString(),
      }).eq("workspace_id", workspaceId);
      if (up.error) throw new Error(up.error.message);
      if (pillars) {
        // pilares novos substituem os antigos (conteúdos antigos guardam o slug como texto)
        const del = await db.from("content_pillars").delete().eq("workspace_id", workspaceId);
        if (del.error) throw new Error(del.error.message);
        const ins = await db.from("content_pillars").insert(pillars.map((x) => ({ workspace_id: workspaceId, slug: x.slug, name: x.name, target_percent: x.targetPercent })));
        if (ins.error) throw new Error(ins.error.message);
      }
    },
    async realCases() {
      const { data, error } = await db.from("casos_reais").select("id, cliente_segmento, problema, resultado, autorizacao, midia_disponivel").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as RealCase[];
    },
    async saveRealCase(c) {
      const row = { cliente_segmento: c.cliente_segmento, problema: c.problema, resultado: c.resultado, autorizacao: c.autorizacao, midia_disponivel: c.midia_disponivel, updated_at: new Date().toISOString() };
      if (c.id) {
        const { data, error } = await db.from("casos_reais").update(row).eq("workspace_id", workspaceId).eq("id", c.id).select("id").maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("caso não encontrado neste perfil");
        return data.id as string;
      }
      const { data, error } = await db.from("casos_reais").insert({ workspace_id: workspaceId, ...row }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    async proofs() {
      const { data, error } = await db.from("provas_filmaveis").select("descricao, status, content_item_id").eq("workspace_id", workspaceId).order("created_at");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { descricao: string; status: FilmableProof["status"]; content_item_id: string | null }[];
      // cena ligada já gravada e enviada = prova filmada (sem precisar marcar à mão)
      const linked = [...new Set(rows.map((r) => r.content_item_id).filter((x): x is string => Boolean(x)))];
      const shot = new Set<string>();
      if (linked.length) {
        const takes = await db.from("takes").select("content_item_id, tags, media_files(state)").eq("workspace_id", workspaceId).in("content_item_id", linked);
        if (takes.error) throw new Error(takes.error.message);
        for (const t of (takes.data ?? []) as unknown as { content_item_id: string; tags: string[] | null; media_files: { state: string } | null }[]) {
          if (!(t.tags ?? []).includes("descartado") && t.media_files?.state === "uploaded_original") shot.add(t.content_item_id);
        }
      }
      return rows.map((r) => ({ descricao: r.descricao, status: r.status === "filmada" || (r.content_item_id && shot.has(r.content_item_id)) ? "filmada" : "falta_filmar", contentItemId: r.content_item_id }));
    },
    async saveProof(p) {
      const row = { workspace_id: workspaceId, descricao: p.descricao, status: p.status, updated_at: new Date().toISOString(), ...(p.contentItemId ? { content_item_id: p.contentItemId } : {}) };
      const { error } = await db.from("provas_filmaveis").upsert(row, { onConflict: "workspace_id,descricao" });
      if (error) throw new Error(error.message);
    },
  };
  return store;
}

const MAX_PROFILES = 10;

/** Mesmo que a função create_profile do banco, feito pelo conector (dono = pessoa do link). */
async function insertProfile(db: SupabaseClient, userId: string, np: NewProfile): Promise<string> {
  const owned = await db.from("workspaces").select("id", { count: "exact", head: true }).eq("created_by", userId).is("deleted_at", null);
  if (owned.error) throw new Error(owned.error.message);
  if ((owned.count ?? 0) >= MAX_PROFILES) throw new Error(`limite de ${MAX_PROFILES} perfis`);
  const id = crypto.randomUUID();
  const ws = await db.from("workspaces").insert({ id, name: np.name, slug: `ws-${id.replace(/-/g, "")}`, created_by: userId });
  if (ws.error) throw new Error(ws.error.message);
  const p = np.profile;
  const steps = [
    () => db.from("workspace_members").insert({ workspace_id: id, user_id: userId, role: "owner" }),
    () => db.from("creator_profiles").insert({
      workspace_id: id, display_name: p.displayName, handle: p.handle, positioning: p.positioning, signature: p.signature, closing_phrase: p.closingPhrase, voice_rules: p.voiceRules,
      tone: { kind: p.kind ?? "pessoal", business: p.business ?? null, extras: p.extras ?? null },
    }),
    () => db.from("content_pillars").insert(np.pillars.map((x) => ({ workspace_id: id, slug: x.slug, name: x.name, target_percent: x.targetPercent }))),
  ];
  try {
    for (const step of steps) {
      const r = await step();
      if (r.error) throw new Error(r.error.message);
    }
    const rt = await db.from("routines").insert({ workspace_id: id, name: "Rotina padrão" }).select("id").single();
    if (rt.error) throw new Error(rt.error.message);
    const blocks = await db.from("routine_blocks").insert(np.routine.map((b) => ({
      id: b.id, workspace_id: id, routine_id: rt.data.id, weekday: b.weekday, start_time: b.startTime, title: b.title, content_hint: b.contentHint, optional: b.optional, default_format: b.format,
    })));
    if (blocks.error) throw new Error(blocks.error.message);
    await db.from("audit_logs").insert({ workspace_id: id, actor: userId, action: "workspace.create_profile.mcp" });
    return id;
  } catch (e) {
    // sem perfil pela metade: apaga o que entrou (cascade)
    await db.from("workspaces").delete().eq("id", id);
    throw e;
  }
}

/** Perfis em que a pessoa do link pode escrever (dono/editor); cada chamada usa só os dados do perfil escolhido. */
export function supabaseMcpContext(db: SupabaseClient, userId: string, defaultProfileId: string): McpContext {
  const canWrite = async (workspaceId: string) => {
    const { data } = await db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    return Boolean(data && WRITE_ROLES.includes(data.role as string));
  };
  return {
    defaultProfileId,
    async profiles(): Promise<McpProfile[]> {
      const { data, error } = await db.from("workspace_members").select("workspace_id, role, workspaces(name, deleted_at)").eq("user_id", userId);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as { workspace_id: string; role: string; workspaces: { name: string; deleted_at: string | null } | null }[];
      const mine = rows.filter((r) => WRITE_ROLES.includes(r.role) && r.workspaces && !r.workspaces.deleted_at);
      const ids = mine.map((r) => r.workspace_id);
      const prof = ids.length ? await db.from("creator_profiles").select("workspace_id, signature, tone").in("workspace_id", ids) : { data: [] };
      const byWs = new Map(((prof.data ?? []) as { workspace_id: string; signature: string | null; tone: { kind?: string } | null }[]).map((p) => [p.workspace_id, p]));
      return mine.map((r) => ({
        id: r.workspace_id, name: r.workspaces!.name, kind: byWs.get(r.workspace_id)?.tone?.kind === "empresa" ? "empresa" : "pessoal", signature: byWs.get(r.workspace_id)?.signature ?? "",
      }));
    },
    async store(profileId) {
      return /^[0-9a-f-]{36}$/i.test(profileId) && (await canWrite(profileId)) ? supabaseMcpStore(db, profileId, userId) : null;
    },
    createProfile: (np) => insertProfile(db, userId, np),
  };
}

/** sha-256 em hex (o banco guarda só o hash do token do link). */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token do link → workspace/usuário (null se não existe, foi desligado ou a pessoa saiu do workspace). */
export async function resolveMcpToken(db: SupabaseClient, token: string): Promise<{ workspaceId: string; userId: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await db.from("mcp_tokens").select("id, workspace_id, user_id").eq("token_hash", await sha256Hex(token)).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  const member = await db.from("workspace_members").select("role").eq("workspace_id", data.workspace_id).eq("user_id", data.user_id).maybeSingle();
  if (!member.data || member.data.role === "viewer") return null;
  await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { workspaceId: data.workspace_id, userId: data.user_id };
}
