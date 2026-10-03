import { supabase } from "./supabase";

export interface DirectorRequest { id: string; texto: string; resposta: string | null; createdAt: string }

/** Pedidos deste vídeo ao Diretor e as respostas (mais novos primeiro). Sem nuvem/internet: lista vazia. */
export async function listDirectorRequests(contentId: string): Promise<DirectorRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("pedidos_diretor").select("id, texto, resposta, created_at").eq("content_item_id", contentId)
    .order("created_at", { ascending: false }).limit(10);
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id as string, texto: r.texto as string, resposta: (r.resposta as string | null) ?? null, createdAt: r.created_at as string }));
}

/** Guarda o pedido para o Claude ler pelo conector. Lança erro (mostrado na tela) se não der. */
export async function sendDirectorRequest(workspaceId: string, contentId: string, texto: string): Promise<void> {
  if (!supabase) throw new Error("O Diretor precisa da nuvem configurada.");
  const { error } = await supabase.from("pedidos_diretor").insert({ workspace_id: workspaceId, content_item_id: contentId, texto: texto.trim().slice(0, 600) });
  if (error) throw new Error(error.message);
}

/** Abre o Claude já com o pedido: ele lê o vídeo pelo conector, age e responde no app. */
export function claudeAskUrl(workspaceId: string, contentId: string, texto: string): string {
  const ask = `No Post.ai (profile_id ${workspaceId}), o criador pediu sobre o conteúdo ${contentId}: "${texto.trim()}". `
    + "Use pedidos_do_criador, ler_roteiro, listar_takes e ler_status_gravacao; atenda com propor_edicao (ou salvar_roteiro se for mudar a fala) e responda com responder_pedido.";
  return `https://claude.ai/new?q=${encodeURIComponent(ask)}`;
}
