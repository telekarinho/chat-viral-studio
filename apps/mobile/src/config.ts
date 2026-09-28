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

export const newId = (): string => Crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
