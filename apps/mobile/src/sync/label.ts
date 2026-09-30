import type { SyncStatus } from "./engine";

export function syncLabel(st: SyncStatus, cloud: boolean): string {
  if (!cloud) return "Modo local";
  if (!st.online) return st.pendingMedia ? `Offline · ${st.pendingMedia} vídeo(s) salvos no aparelho` : "Offline · tudo salvo no aparelho";
  if (st.running) return "Sincronizando…";
  if (st.failedMedia) return `${st.failedMedia} envio(s) com falha`;
  if (st.stuckRows) return `${st.stuckRows} dado(s) não sincronizaram — toque em Ajustes`;
  if (st.pendingMedia || st.pendingRows) return "Na fila para enviar";
  return "Sincronizado ✓";
}
