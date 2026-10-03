import { DEFAULT_EDIT_CHOICES, applyEditProposal } from "@postai/domain";
import { getDb } from "./db/database";
import { getContent, setEditChoices, type ContentItem } from "./db/repo";
import { decideEditProposal, pullEditProposal } from "./editProposals";
import { contentPlan } from "./finalPlan";
import { kickRenderWorker, latestRenderJob, requestFinalRender } from "./finalRender";

/**
 * Modo 1 botão: terminou de gravar, o Diretor monta sozinho (com a sugestão dele, se houver) — sem tela de
 * confirmar. Sem internet, fica marcado e é pedido quando a conexão voltar. O criador aprova no vídeo pronto.
 */
const KEY = "automontar:";

export async function queueAutoMontage(contentId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", `${KEY}${contentId}`, new Date().toISOString());
}

async function clear(contentId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM kv WHERE key = ?", `${KEY}${contentId}`);
}

/** Aplica a proposta pendente do Diretor (se houver) e devolve o conteúdo atualizado. */
export async function applyPendingProposal(c: ContentItem, business: boolean): Promise<ContentItem> {
  const p = await pullEditProposal(c.workspaceId, c.id, business).catch(() => null);
  if (!p) return c;
  const updated = await setEditChoices(c.id, applyEditProposal(c.edit ?? { ...DEFAULT_EDIT_CHOICES, retouch: business ? "leve" : "forte" }, p.edit));
  await decideEditProposal(c.id, "montar").catch(() => undefined);
  return updated;
}

/** Pede a montagem de um conteúdo marcado. true = pedida (ou já existia); false = ainda não dá (tenta depois). */
export async function tryAutoMontage(contentId: string): Promise<boolean> {
  const c = await getContent(contentId);
  if (!c) return clear(contentId).then(() => true);
  const existing = await latestRenderJob(c.id).catch(() => undefined);
  if (existing === undefined) return false; // sem internet
  if (existing && existing.status !== "failed") return clear(contentId).then(() => true);
  const cp = await contentPlan(c);
  if (!cp?.plan) return false;
  const ready = await applyPendingProposal(c, cp.business);
  const r = await requestFinalRender(ready.workspaceId, ready.id, cp.plan);
  if (!r.ok) return false;
  void kickRenderWorker();
  await clear(contentId);
  return true;
}

/** Roda os pendentes (app aberto / ao voltar para ele). */
export async function runAutoMontages(): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string }>("SELECT key FROM kv WHERE key LIKE ?", `${KEY}%`);
  for (const r of rows) await tryAutoMontage(r.key.slice(KEY.length)).catch(() => false);
}
