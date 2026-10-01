import { buildEditPlan, buildSegments, isBusiness, watermarkCorner, wholeTakeSegment, type EditPlan, type ScriptSegment } from "@postai/domain";
import { latestTakesBySegment, listTakes, workspaceById, type ContentItem, type Take } from "./db/repo";

export interface ContentPlan {
  segments: ScriptSegment[];
  recorded: number[];
  /** null enquanto falta parte (ou nada gravado) */
  plan: EditPlan | null;
  /** os vídeos que entram na montagem (para mostrar o envio para a nuvem) */
  takes: Take[];
  business: boolean;
}

/** Plano de edição do conteúdo: todas as partes gravadas, ou o take inteiro gravado de uma vez. */
export async function contentPlan(item: ContentItem): Promise<ContentPlan | null> {
  if (!item.draft) return null;
  const ws = await workspaceById(item.workspaceId);
  const business = isBusiness(ws.profile);
  const segments = buildSegments(item.draft, { selectedHook: item.selectedHook ?? 0, userEdited: Boolean(item.meta?.userEdited), closingPhrase: ws.profile.closingPhrase, business });
  const chosen = await latestTakesBySegment(item.id);
  const recorded = segments.filter((sg) => chosen.has(sg.index)).map((sg) => sg.index);
  const opts = { signature: ws.profile.signature, watermark: watermarkCorner(ws.profile.watermark) };
  if (recorded.length === segments.length) {
    const takes = segments.map((sg) => chosen.get(sg.index)!);
    const plan = buildEditPlan({ ...opts, segments, takes: takes.map((t, i) => ({ segmentIndex: segments[i]!.index, takeId: t.id, durationMs: t.media.durationMs ?? 0 })) });
    return { segments, recorded, plan, takes, business };
  }
  const whole = recorded.length === 0 ? (await listTakes({ contentItemId: item.id })).find((t) => t.segmentIndex === null && !t.tags.includes("descartado")) : undefined;
  if (whole) {
    const plan = buildEditPlan({ ...opts, segments: [wholeTakeSegment(item.draft)], takes: [{ segmentIndex: 0, takeId: whole.id, durationMs: whole.media.durationMs ?? 0 }] });
    return { segments, recorded, plan, takes: [whole], business };
  }
  return { segments, recorded, plan: null, takes: [], business };
}
