import * as Sentry from "@sentry/react-native";
import { config } from "./config";

let enabled = false;

/** Crash/error reporting. Without EXPO_PUBLIC_SENTRY_DSN errors are only kept in the local log below. */
export function initTelemetry(): void {
  if (!config.sentryDsn) return;
  Sentry.init({ dsn: config.sentryDsn, release: `postai@${config.version}+${config.buildSha}`, sendDefaultPii: false, tracesSampleRate: 0 });
  enabled = true;
}

const recent: { at: string; message: string }[] = [];

export function reportError(error: unknown, context?: string): void {
  const message = `${context ? `${context}: ` : ""}${error instanceof Error ? error.message : String(error)}`;
  recent.unshift({ at: new Date().toISOString(), message });
  recent.length = Math.min(recent.length, 30);
  if (enabled) Sentry.captureException(error instanceof Error ? error : new Error(message), { tags: { context: context ?? "app" } });
}

export const recentErrors = () => [...recent];
export const wrapRoot = <T,>(c: T): T => (enabled ? (Sentry.wrap(c as never) as T) : c);
