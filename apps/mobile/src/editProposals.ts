import { parseEditProposal, type EditProposal } from "@postai/domain";
import { listOwnMusic } from "./ownMusic";
import { supabase } from "./supabase";

export interface PendingProposal { id: string; edit: EditProposal; motivo: string }
export type ProposalDecision = "montar" | "ajustar" | "dispensar";

/**
 * Proposta de edição que o diretor (Claude) mandou pelo conector. Validada de novo aqui (licença, faixa, volume)
 * antes de aparecer. Sem internet ou sem a tabela no banco: segue sem proposta.
 */
export async function pullEditProposal(workspaceId: string, contentId: string, business: boolean): Promise<PendingProposal | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("propostas_edicao").select("id, edit, motivo").eq("content_item_id", contentId).is("decided_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const e = (data.edit ?? {}) as EditProposal;
  const own = e.music?.startsWith("own:") ? await listOwnMusic(workspaceId).catch(() => []) : [];
  const parsed = parseEditProposal({ autocut: e.autocut, musica: e.music, volume: e.musicVolume, inicio_musica_s: e.musicStartS }, { business, own });
  if (!parsed.ok) {
    await decideEditProposal(contentId, "dispensar");
    return null;
  }
  return { id: data.id as string, edit: parsed.edit, motivo: String(data.motivo ?? "") };
}

/** Decidiu: a proposta (e qualquer outra mais antiga deste vídeo) sai da fila. */
export async function decideEditProposal(contentId: string, decisao: ProposalDecision): Promise<void> {
  if (!supabase) return;
  await supabase.from("propostas_edicao").update({ decided_at: new Date().toISOString(), decisao }).eq("content_item_id", contentId).is("decided_at", null);
}
