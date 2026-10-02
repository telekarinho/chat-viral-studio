import { ScenesSchema } from "@postai/domain";
import { config } from "./config";
import { importManualDraft } from "./generate";
import { supabase } from "./supabase";
import { setContentScenes, type ContentItem } from "./db/repo";

/** Link do conector MCP para colar no Claude (Configurações → Conectores → Adicionar conector personalizado). */
export const mcpUrl = (token: string): string => `${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/mcp/${token}`;

/** Cria um link novo para o perfil (o anterior deixa de funcionar). O token só aparece agora. */
export async function createConnectorLink(workspaceId: string): Promise<string> {
  if (!supabase) throw new Error("O conector precisa da nuvem configurada.");
  const { data, error } = await supabase.rpc("create_mcp_token", { p_workspace: workspaceId });
  if (error) throw new Error(error.message);
  return mcpUrl(data as string);
}

export async function revokeConnectorLinks(workspaceId: string): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("revoke_mcp_tokens", { p_workspace: workspaceId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Este perfil tem um link ligado? (para mostrar "conectado" sem nunca revelar o token) */
export async function connectorActive(workspaceId: string): Promise<{ active: boolean; lastUsedAt: string | null }> {
  if (!supabase) return { active: false, lastUsedAt: null };
  const { data } = await supabase.from("mcp_tokens").select("last_used_at").eq("workspace_id", workspaceId).is("revoked_at", null).limit(1).maybeSingle();
  return { active: Boolean(data), lastUsedAt: (data?.last_used_at as string | null) ?? null };
}

/**
 * Roteiro que o assistente salvou pelo conector: passa pelas MESMAS checagens do modo copiar/colar
 * (contrato, preço, alegação sem prova, repetição) antes de entrar no app. Sem internet: segue sem.
 */
export async function pullAssistantDraft(contentId: string): Promise<{ content: ContentItem } | { errors: string[] } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("assistant_drafts").select("id, draft").eq("content_item_id", contentId).is("consumed_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const consume = () => supabase!.from("assistant_drafts").update({ consumed_at: new Date().toISOString() }).eq("content_item_id", contentId).is("consumed_at", null);
  // cena de apoio dirigida (B-roll): só a lista de takes
  const box = data.draft as { tipo?: string; takes?: unknown } | null;
  if (box?.tipo === "cenas") {
    const scenes = ScenesSchema.safeParse(box.takes);
    await consume();
    return scenes.success ? { content: await setContentScenes(contentId, scenes.data) } : { errors: ["As cenas do assistente vieram num formato inválido."] };
  }
  const r = await importManualDraft(contentId, JSON.stringify(data.draft));
  // usado ou recusado, não volta a ser aplicado (todos os pendentes deste conteúdo saem da fila)
  await supabase.from("assistant_drafts").update({ consumed_at: new Date().toISOString() }).eq("content_item_id", contentId).is("consumed_at", null);
  return r.ok ? { content: r.content } : { errors: r.errors };
}
