#!/usr/bin/env bash
# Critical Android flow + offline test. Runs inside the emulator (android-emulator-runner) in CI.
# Needs: APK, maestro on PATH, local Supabase reachable from the host (emulator sees it at 10.0.2.2).
set -euo pipefail
APK="$1"
OUT="$(realpath -m "${E2E_OUT:-e2e-results}")"
mkdir -p "$OUT"
PKG=me.rodrigoserra.postai
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${E2E_EMAIL:?}" "${E2E_PASSWORD:?}" "${SUPABASE_URL:?}" "${SUPABASE_SERVICE_ROLE_KEY:?}" "${DB_URL:?}"

net() { adb shell svc wifi "$1"; adb shell svc data "$1"; }
flow() {
  # screenshots (takeScreenshot) land in the cwd; debug output keeps hierarchy + screenshot on failure
  (cd "$OUT" && maestro test --format junit --output "$OUT/$1.xml" --test-output-dir "$OUT/$1" -e EMAIL="$E2E_EMAIL" -e PASSWORD="$E2E_PASSWORD" "$HERE/$1.yaml") || {
    adb logcat -d -s ReactNativeJS:V AndroidRuntime:E > "$OUT/logcat-$1.txt" || true
    return 1
  }
}
step() { echo "::group::$1"; }
endstep() { echo "::endgroup::"; }

adb install -r "$APK"
# emulator hygiene: let the launcher settle and keep system ANR dialogs from covering the app
adb shell settings put global hide_error_dialogs 1 || true
adb shell settings put secure anr_show_background 0 || true
sleep 20
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null || true
net enable

step "1. login + onboarding + Hoje"; flow 01_login_onboarding_today; endstep
step "2. roteiro + 3 ganchos + E/MAS/POR ISSO + legenda + memória"; flow 02_script_captions; endstep
sleep 35 # let the outbox push the plan/scripts while online

step "3. OFFLINE: teleprompter + gravar + salvar local + concluir"
net disable
sleep 5
adb shell ping -c 1 -W 2 10.0.2.2 && echo "WARN: host still reachable" || echo "offline confirmed"
flow 03_offline_record
endstep

step "4. matar o app offline e reabrir"
adb shell am force-stop "$PKG"
sleep 3
flow 04_after_kill_offline
endstep

REMOTE_BEFORE=$(psql "$DB_URL" -tAc "select count(*) from storage.objects where bucket_id='takes'")
echo "objetos remotos antes de reconectar: $REMOTE_BEFORE"
test "$REMOTE_BEFORE" = "0"

step "5. reconectar e sincronizar"
net enable
flow 05_sync_back_online
endstep

step "6. integridade remota"
"$HERE/verify-remote.sh" | tee "$OUT/remote-integrity.txt"
endstep

step "7. gravação por partes + montagem final (worker FFmpeg no host)"
flow 06_parts_and_final
psql "$DB_URL" -tAc "select status, output_size from render_jobs" | tee "$OUT/render-jobs.txt"
grep -q "^done|" "$OUT/render-jobs.txt"
endstep
adb logcat -d -s ReactNativeJS:V > "$OUT/logcat-js.txt" || true
echo "E2E OK"
