import type { ExpoConfig } from "expo/config";

// Public, build-time values only (anon key is designed to be public; RLS protects data).
// Never put OPENAI_API_KEY or service-role keys here — they live only on the API server.
const env = process.env;
const e2e = env.POSTAI_E2E === "1";

const config: ExpoConfig = {
  name: e2e ? "Post.ai E2E" : "Post.ai",
  slug: "post-ai",
  scheme: "postai",
  version: "0.2.0",
  orientation: "portrait",
  android: {
    package: "me.rodrigoserra.postai",
    versionCode: Number(env.POSTAI_VERSION_CODE ?? 2),
    permissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS"],
    blockedPermissions: ["android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"],
  },
  ios: { bundleIdentifier: "me.rodrigoserra.postai" },
  plugins: [
    "expo-router",
    "expo-sqlite",
    "expo-secure-store",
    ["expo-notifications", { color: "#111827" }],
    [
      "react-native-vision-camera",
      {
        cameraPermissionText: "O Post.ai usa a câmera para você gravar seus vídeos.",
        enableMicrophonePermission: true,
        microphonePermissionText: "O Post.ai usa o microfone para gravar o áudio dos seus vídeos.",
        enableCodeScanner: false,
        enableLocation: false,
      },
    ],
    ["expo-build-properties", { android: { usesCleartextTraffic: e2e, minSdkVersion: 26 } }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    apiUrl: env.EXPO_PUBLIC_API_URL ?? "",
    sentryDsn: env.EXPO_PUBLIC_SENTRY_DSN ?? "",
    buildSha: env.GITHUB_SHA?.slice(0, 7) ?? "local",
    e2e,
  },
};

export default config;
