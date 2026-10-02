import type { SupabaseClient } from "@supabase/supabase-js";
import { BRASILIA_OFFSET_MIN, buildDayPlan, type ContentDraft, type ContentFormat, type EditChoices, type Pillar, type PostMetrics, type ProjectInfo, type RoutineBlock } from "@postai/domain";
import { supabaseMemory } from "./adapters";
import type { McpContent, McpContext, McpPost, McpProfile, McpRecording, McpScript, McpStore } from "./mcp-tools";

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

/**
 * Store do conector MCP. Usa a chave de serviço, então TODA consulta filtra pelo workspace do link
 * (o token já foi conferido antes de chegar aqui).
 */
export function supabaseMcpStore(db: SupabaseClient, workspaceId: string, userId: string): McpStore {
  const memory = supabaseMemory(db, userId);
  const withScript = async (rows: ContentRow[]): Promise<McpContent[]> => {
    const ids = rows.map((r) => r.id);
    const { data } = ids.length ? await db.from("scripts").select("content_item_id").in("content_item_id", ids) : { data: [] };
    const scripted = new Set((data ?? []).map((s: { content_item_id: string }) => s.content_item_id));
    return rows.map((r) => ({
      id: r.id, format: r.format, pillarSlug: r.pillar_slug ?? "", title: r.title, date: r.plan_date ?? "", hasScript: scripted.has(r.id), project: asProject(r.structured_payload),
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
    async readScript(contentId): Promise<McpScript> {
      const [script, content, pending] = await Promise.all([
        db.from("scripts").select("draft").eq("workspace_id", workspaceId).eq("content_item_id", contentId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("content_items").select("structured_payload").eq("workspace_id", workspaceId).eq("id", contentId).maybeSingle(),
        db.from("assistant_drafts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("content_item_id", contentId).is("consumed_at", null),
      ]);
      const sp = (content.data?.structured_payload ?? {}) as Record<string, unknown>;
      return {
        draft: (script.data?.draft ?? null) as ContentDraft | null,
        edit: (sp.edit ?? null) as EditChoices | null,
        metrics: (sp.metrics ?? null) as PostMetrics | null,
        postedAt: typeof sp.posted_at === "string" ? sp.posted_at : null,
        pendingFromAssistant: (pending.count ?? 0) > 0,
      };
    },
    async planDays(startDate, days) {
      const out: { date: string; created: boolean; items: McpContent[] }[] = [];
      const [pillarRows, blockRows, recentRows] = await Promise.all([
        db.from("content_pillars").select("slug, name, target_percent, active").eq("workspace_id", workspaceId),
        db.from("routine_blocks").select("id, weekday, start_time, title, content_hint, optional, default_format").eq("workspace_id", workspaceId),
        db.from("content_items").select("pillar_slug").eq("workspace_id", workspaceId).order("plan_date", { ascending: false }).limit(30),
      ]);
      const err = pillarRows.error ?? blockRows.error ?? recentRows.error;
      if (err) throw new Error(err.message);
      const pillars: Pillar[] = (pillarRows.data ?? []).map((p) => ({ slug: p.slug, name: p.name, targetPercent: Number(p.target_percent), active: p.active }));
      const routine: RoutineBlock[] = (blockRows.data ?? []).map((b) => ({
        id: b.id, weekday: b.weekday, startTime: String(b.start_time).slice(0, 5), title: b.title, contentHint: b.content_hint, optional: b.optional, format: b.default_format as ContentFormat,
      }));
      const history = (recentRows.data ?? []).map((r) => r.pillar_slug as string).filter(Boolean).reverse();
      for (let i = 0; i < days; i++) {
        const date = addDays(startDate, i);
        const [from, to] = brtDayRange(date);
        const tasks = await db.from("recording_tasks").select("id").eq("workspace_id", workspaceId).gte("scheduled_for", from).lt("scheduled_for", to).limit(1);
        if (tasks.error) throw new Error(tasks.error.message);
        const existing = await store.contentsOn(date);
        // dia já planejado (pelo app ou antes): fica como está
        if (existing.length || tasks.data?.length) {
          out.push({ date, created: false, items: existing });
          continue;
        }
        const plan = buildDayPlan({ date: new Date(0), dateKey: date, utcOffsetMinutes: BRASILIA_OFFSET_MIN, workspaceId, routine, pillars, recentPillarSlugs: history, newId: () => crypto.randomUUID(), now: new Date().toISOString() });
        history.push(...plan.contentItems.map((c) => c.pillarSlug));
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
      const scripts = await db.from("scripts").select("content_item_id").eq("workspace_id", workspaceId).gte("created_at", daysAgo(days));
      if (scripts.error) throw new Error(scripts.error.message);
      const ids = [...new Set((scripts.data ?? []).map((r) => r.content_item_id as string).filter(Boolean))];
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
      return (data ?? [])
        .map((r) => ({ topic: String((r.draft as { topic?: string } | null)?.topic ?? ""), contentItemId: (r.content_item_id as string | null) ?? null }))
        .filter((r) => r.topic);
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
    recentFingerprints: () => memory.recentFingerprints(workspaceId),
    recentSummaries: () => memory.recentSummaries(workspaceId),
    async saveDraft(contentId, draft) {
      const { error } = await db.from("assistant_drafts").insert({ workspace_id: workspaceId, content_item_id: contentId, draft, source: "mcp" });
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
      // posts = conteúdos postados (hora registrada) ou com números anotados
      const { data, error } = await db.from("content_items").select(COLS).eq("workspace_id", workspaceId)
        .or("structured_payload->>posted_at.not.is.null,structured_payload->>metrics.not.is.null")
        .order("plan_date", { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return ((data ?? []) as ContentRow[]).map((r): McpPost => {
        const p = r.structured_payload ?? {};
        return {
          id: r.id, title: r.title, pillarSlug: r.pillar_slug ?? "", format: r.format, date: r.plan_date ?? "",
          postedAt: typeof p.posted_at === "string" ? p.posted_at : null,
          postedTo: Array.isArray(p.posted_to) ? (p.posted_to as string[]) : [],
          metrics: (p.metrics ?? null) as PostMetrics | null,
        };
      });
    },
  };
  return store;
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
