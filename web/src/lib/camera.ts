// Single shared webcam stream + <video> element, reused by the live preview
// (ChatStage) and the exporter so we never open the camera twice.
let stream: MediaStream | null = null;
let videoEl: HTMLVideoElement | null = null;

export async function startCamera(): Promise<HTMLVideoElement> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    throw new Error('Câmera não suportada neste navegador.');
  }
  if (!videoEl) {
    videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
  }
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
  }
  return videoEl;
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (videoEl) videoEl.srcObject = null;
}

// The element only if a live stream is attached and has frames to draw.
export function getCameraEl(): HTMLVideoElement | null {
  if (stream && videoEl && videoEl.readyState >= 2) return videoEl;
  return null;
}

export function isCameraOn() {
  return Boolean(stream);
}
