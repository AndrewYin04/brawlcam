export type CameraError = 'denied' | 'nodevice' | 'insecure' | 'inuse' | 'unknown';

export class CameraFailure extends Error {
  constructor(public kind: CameraError, message: string) {
    super(message);
  }
}

export async function startCamera(video: HTMLVideoElement, lowRes: boolean): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraFailure('insecure', 'Camera access needs HTTPS. Open the https:// address.');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraFailure('nodevice', 'This browser cannot access a camera.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: lowRes ? 640 : 960 }, height: { ideal: lowRes ? 480 : 540 }, frameRate: { ideal: 30 } },
    });
  } catch (e) {
    const name = (e as DOMException)?.name ?? '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraFailure('denied', 'Camera permission was denied. Allow camera access in your browser settings, then try again.');
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') throw new CameraFailure('nodevice', 'No camera was found on this device.');
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraFailure('inuse', 'The camera is busy in another app or tab. Close it and try again.');
    throw new CameraFailure('unknown', 'Could not start the camera: ' + (e as Error)?.message);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  // Never hang on a camera that is slow to start: the pose loop waits for frames on its own.
  const timeout = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await Promise.race([video.play().catch(() => {}), timeout(4000)]);
  if (video.readyState < 2) await Promise.race([new Promise((r) => video.addEventListener('loadeddata', r, { once: true })), timeout(6000)]);
  return stream;
}

export function stopCamera(video: HTMLVideoElement) {
  const s = video.srcObject as MediaStream | null;
  s?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
