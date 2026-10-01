import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostMetrics, ProjectInfo } from "@postai/domain";
import { supabaseMemory } from "./adapters";
import type { McpContent, McpPost, McpStore } from "./mcp";

type ContentRow = { id: string; format: string; pillar_slug: string | null; title: string; plan_date: string | null; structured_payload: Record<string, unknown> | null };
const COLS = "id, format, pillar_slug, title, plan_date, structured_payload";

const asProject = (p: Record<string, unknown> | null) => (p?.project ?? null) as ProjectInfo | null;

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
  return {
    async contentsOn(date) {
      const { data, error } = await db.from("content_items").select(COLS).eq("workspace_id", workspaceId).eq("plan_date", date).order("scheduled_for");
      if (error) throw new Error(error.message);
      return withScript((data ?? []) as ContentRow[]);
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
