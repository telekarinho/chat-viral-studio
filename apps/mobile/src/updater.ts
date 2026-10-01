import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { config } from "./config";

const RELEASES_URL = "https://api.github.com/repos/telekarinho/chat-viral-studio/releases?per_page=10";
const TAG_PREFIX = "postai-beta-";
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export interface AvailableUpdate {
  tag: string;
  apkUrl: string;
  sizeBytes: number;
  publishedAt: string;
}

interface GhRelease {
  tag_name: string;
  draft: boolean;
  published_at: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

/** Latest beta published on GitHub Releases, if it is not the build running now. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== "android" || config.e2e || config.buildSha === "local") return null;
  const res = await fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) return null;
  const releases = (await res.json()) as GhRelease[];
  const latest = releases
    .filter((r) => !r.draft && r.tag_name.startsWith(TAG_PREFIX))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  if (!latest || latest.tag_name === `${TAG_PREFIX}${config.buildSha}`) return null;
  const apk = latest.assets.find((a) => a.name.endsWith(".apk"));
  if (!apk) return null;
  return { tag: latest.tag_name, apkUrl: apk.browser_download_url, sizeBytes: apk.size, publishedAt: latest.published_at };
}

const DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

/** Baixa o APK; queda de conexão no meio (Wi-Fi trocando, "connection abort") tenta de novo sozinho. */
async function downloadApk(update: AvailableUpdate): Promise<File> {
  let last: unknown = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    const dest = new File(Paths.cache, "post-ai-update.apk");
    if (dest.exists) dest.delete();
    try {
      const file = await File.downloadFileAsync(update.apkUrl, dest);
      if ((file.size ?? 0) >= update.sizeBytes * 0.95) return file;
      last = new Error("download incompleto");
    } catch (e) {
      last = e;
    }
    if (attempt < DOWNLOAD_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
  }
  const why = last instanceof Error ? last.message.split("\n")[0] : "erro";
  throw new Error(`A internet caiu durante o download (${why}). Tente de novo com o app aberto, ou baixe pelo navegador.`);
}

/** Downloads the new APK and opens Android's installer (the user confirms "Instalar"; data is kept). */
export async function installUpdate(update: AvailableUpdate): Promise<void> {
  const file = await downloadApk(update);
  const contentUri = await LegacyFS.getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: "application/vnd.android.package-archive",
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
