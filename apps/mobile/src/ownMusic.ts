import * as DocumentPicker from "expo-document-picker";
import * as LegacyFS from "expo-file-system/legacy";
import type { OwnMusic } from "@postai/domain";
import { newId } from "./config";
import { supabase } from "./supabase";

/** Limite do armazenamento por arquivo é 50 MB; música de vídeo curto é bem menor. */
const MAX_BYTES = 20 * 1024 * 1024;
const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav" };

export type OwnMusicOrigin = "minha" | "licenciada" | "youtube_audio_library";

export async function listOwnMusic(workspaceId: string): Promise<OwnMusic[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("musicas_proprias").select("id, titulo, comercial, storage_key").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ id: m.id as string, titulo: m.titulo as string, comercial: Boolean(m.comercial), storageKey: m.storage_key as string }));
}

/**
 * Escolhe um áudio do celular, envia para o armazenamento do perfil e registra com a licença declarada.
 * `youtube_audio_library` significa arquivo baixado legitimamente da Biblioteca de Áudio do YouTube —
 * nunca áudio extraído de vídeo comum do YouTube.
 * null = o criador cancelou a escolha do arquivo.
 */
export async function uploadOwnMusic(workspaceId: string, decl: { origem: OwnMusicOrigin; comercial: boolean }): Promise<OwnMusic | null> {
  if (!supabase) throw new Error("Enviar música precisa da nuvem configurada.");
  const picked = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const a = picked.assets[0];
  if ((a.size ?? 0) > MAX_BYTES) throw new Error("Arquivo grande demais (máximo 20 MB). Use um MP3.");
  const ext = EXT[a.mimeType ?? ""] ?? (a.name.split(".").pop() ?? "mp3").toLowerCase().slice(0, 4);
  if (!Object.values(EXT).includes(ext)) throw new Error("Formato não aceito. Use MP3, M4A, AAC ou WAV.");
  const id = newId();
  const key = `${workspaceId}/music/${id}.${ext}`;
  const signed = await supabase.storage.from("takes").createSignedUploadUrl(key);
  if (signed.error) throw new Error(signed.error.message);
  const res = await LegacyFS.uploadAsync(signed.data.signedUrl, a.uri, {
    httpMethod: "PUT", uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": a.mimeType ?? "audio/mpeg" },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Falha ao enviar (HTTP ${res.status}). Tente de novo com internet.`);
  const titulo = a.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Minha música";
  const ins = await supabase.from("musicas_proprias").insert({ id, workspace_id: workspaceId, storage_key: key, titulo, origem: decl.origem, comercial: decl.comercial });
  if (ins.error) throw new Error(ins.error.message);
  return { id, titulo, comercial: decl.comercial, storageKey: key };
}

/** Link temporário para ouvir a prévia da música própria. */
export async function ownMusicUrl(storageKey: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from("takes").createSignedUrl(storageKey, 600);
  return data?.signedUrl ?? null;
}
