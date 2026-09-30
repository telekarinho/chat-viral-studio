import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { PROMPT_VERSION, parseDraft, pickNextPillar, type ContentDraft } from "@postai/domain";
import { newId } from "./config";
import { createAdHocContent, donePillarSlugs, registerTake, requireWorkspace, saveDraft, type ContentItem } from "./db/repo";
import { takesDir } from "./media";
import { syncNow } from "./sync/engine";

export const FREE_SPEECH_MODEL = "fala-livre";
const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

/**
 * Fala livre: grava (ou importa) sem roteiro. O servidor escuta a fala, corta erros e pausas,
 * legenda pelo que foi dito e devolve a transcrição para virar a legenda do post.
 */
export async function createFreeSpeech(kind: "gravar" | "importado"): Promise<ContentItem> {
  const ws = await requireWorkspace();
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const title = `${kind === "importado" ? "Vídeo importado" : "Fala livre"} — ${stamp}`;
  const pillar = pickNextPillar(ws.pillars, await donePillarSlugs());
  const c = await createAdHocContent("main_video", pillar.slug, title);
  const sig = ws.profile.signature;
  const placeholder = "Fala livre: a legenda é feita pelo que você disser.";
  const draft: ContentDraft = {
    title, pillar: pillar.name, format: "main_video", duration_seconds: 60, structure: "observacao", topic: title, key_phrase: title, metaphor: "",
    hook_options: [title, title, title], narrative: { e: placeholder, mas: placeholder, por_isso: placeholder }, script: placeholder, screen_text: "", cta: "—",
    caption: { instagram: `${title}\n\n${sig}`, tiktok: title, facebook: `${title}\n\n${sig}`, youtube_shorts: title },
    hashtags: ["#vidareal"], recording_suggestions: [{ scene: "fala para a câmera", duration_seconds: 30, location_hint: "" }], versions: [],
  };
  const parsed = parseDraft(draft);
  if (!parsed.ok) throw new Error(`Não consegui preparar a fala livre: ${parsed.errors.join("; ")}`);
  // sem impressões digitais: fala livre não entra na memória de anti-repetição com texto de enfeite
  return saveDraft(c.id, parsed.draft, { source: "local", model: FREE_SPEECH_MODEL, prompt_version: PROMPT_VERSION, attempts: 1, avoided: [], notices: [] }, []);
}

/** Importa um vídeo da galeria/arquivos para o app editar sozinho. null = o usuário cancelou. */
export async function importVideo(): Promise<ContentItem | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  if ((asset.size ?? 0) > MAX_IMPORT_BYTES) throw new Error("Vídeo grande demais (máx. 500 MB).");
  const src = new File(asset.uri);
  if (!src.exists || (src.size ?? 0) <= 0) throw new Error("Não consegui ler o vídeo escolhido.");
  const mediaId = newId();
  const dest = new File(takesDir(), `${mediaId}.mp4`);
  src.copy(dest);
  const saved = new File(takesDir(), `${mediaId}.mp4`);
  if (!saved.exists || (saved.size ?? 0) !== (src.size ?? -1) || !saved.md5) {
    if (saved.exists) saved.delete();
    throw new Error("A cópia do vídeo para o app falhou. Tente de novo.");
  }
  try {
    src.delete(); // só a cópia temporária do seletor; o original na galeria não é tocado
  } catch {
    // cache do sistema: o Android limpa sozinho
  }
  const c = await createFreeSpeech("importado");
  await registerTake({
    mediaId, localUri: saved.uri, sizeBytes: saved.size ?? 0, checksum: saved.md5, width: null, height: null, durationMs: null,
    taskId: null, contentItemId: c.id, category: "importado", camera: "back", segmentIndex: null,
  });
  void syncNow();
  return c;
}
