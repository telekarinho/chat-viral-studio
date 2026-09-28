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

/** Downloads the new APK and opens Android's installer (the user confirms "Instalar"; data is kept). */
export async function installUpdate(update: AvailableUpdate): Promise<void> {
  const dest = new File(Paths.cache, "post-ai-update.apk");
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(update.apkUrl, dest);
  if ((file.size ?? 0) < update.sizeBytes * 0.95) throw new Error("Download incompleto. Tente de novo com internet estável.");
  const contentUri = await LegacyFS.getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: "application/vnd.android.package-archive",
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}
