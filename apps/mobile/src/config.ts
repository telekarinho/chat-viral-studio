import Constants from "expo-constants";
import * as Crypto from "expo-crypto";

type Extra = { supabaseUrl: string; supabaseAnonKey: string; apiUrl: string; sentryDsn: string; buildSha: string; e2e: boolean };
const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const config = {
  supabaseUrl: extra.supabaseUrl ?? "",
  supabaseAnonKey: extra.supabaseAnonKey ?? "",
  apiUrl: (extra.apiUrl ?? "").replace(/\/$/, ""),
  sentryDsn: extra.sentryDsn ?? "",
  buildSha: extra.buildSha ?? "local",
  e2e: extra.e2e ?? false,
  version: Constants.expoConfig?.version ?? "0.0.0",
};

/** Without Supabase configured the app runs in "modo local": everything works on-device, no sync. */
export const cloudEnabled = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/**
 * Script generation endpoint: a dedicated API when configured, otherwise the `generate` Edge Function
 * of the same Supabase project (AI keys live only there).
 */
export const generateEndpoint = config.apiUrl
  ? `${config.apiUrl}/v1/content/generate`
  : cloudEnabled
    ? `${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/generate`
    : "";

export const newId = (): string => Crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
