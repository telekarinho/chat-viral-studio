import { Platform as RNPlatform } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { ContentDraft, Platform } from "@postai/domain";
import { PostaiShare } from "../modules/postai-share";

export type ShareTarget = "tiktok" | "instagram" | "youtube" | "whatsapp";

export const SHARE_TARGETS: Record<ShareTarget, { label: string; packages: string[]; caption: Platform; sendsText: boolean }> = {
  tiktok: { label: "TikTok", packages: ["com.zhiliaoapp.musically", "com.ss.android.ugc.trill"], caption: "tiktok", sendsText: false },
  instagram: { label: "Instagram", packages: ["com.instagram.android"], caption: "instagram", sendsText: false },
  youtube: { label: "YouTube Shorts", packages: ["com.google.android.youtube"], caption: "youtube_shorts", sendsText: false },
  whatsapp: { label: "WhatsApp", packages: ["com.whatsapp", "com.whatsapp.w4b"], caption: "instagram", sendsText: true },
};

/**
 * 1 toque: copia a legenda certa da rede e abre o app com o vídeo já anexado. Sem o app instalado (ou fora do APK),
 * abre o seletor do Android. Retorna o que aconteceu para a tela avisar "legenda copiada, é só colar".
 */
export async function shareVideoTo(target: ShareTarget | null, fileUri: string, draft: ContentDraft): Promise<"app" | "sheet"> {
  const t = target ? SHARE_TARGETS[target] : null;
  const caption = draft.caption[t?.caption ?? "instagram"];
  await Clipboard.setStringAsync(caption);
  if (RNPlatform.OS === "android" && PostaiShare) {
    const contentUri = await LegacyFS.getContentUriAsync(fileUri);
    for (const pkg of t?.packages ?? []) {
      if (await PostaiShare.shareVideo(contentUri, pkg, t!.sendsText ? caption : null)) return "app";
    }
    if (await PostaiShare.shareVideo(contentUri, null, null)) return "sheet";
  }
  await Sharing.shareAsync(fileUri, { mimeType: "video/mp4", dialogTitle: t ? `Postar no ${t.label}` : "Postar vídeo" });
  return "sheet";
}
