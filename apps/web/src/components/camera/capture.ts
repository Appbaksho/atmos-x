/**
 * Pure browser helpers for the in-app camera: draw a frame (video or file) onto a canvas no larger
 * than MAX_EDGE, burn the GPS + time "seal" into the bottom edge, and encode a JPEG Blob.
 * No React here, so V0-6/V0-7 can reuse `fileToCapture` for their own file inputs if they want.
 */

/** Longest edge of the stored photo (matches the data layer's ≤ 1600 px blob). */
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.86;

export type Fix = { lat: number; lng: number; accuracy: number | null };

/** What `Camera` hands to `onCapture`. Extra fields are optional so the core API stays stable. */
export type CameraCapture = {
  blob: Blob;
  /** ISO 8601 time the photo was taken */
  takenAt: string;
  lat: number | null;
  lng: number | null;
  /** GPS accuracy in metres, when known */
  accuracy?: number | null;
  /** 'camera' = live in-app viewfinder, 'file' = the file-input fallback */
  source?: 'camera' | 'file';
  width?: number;
  height?: number;
};

/** "23.7629° N, 90.3601° E ± 4 m" (Latin digits: it is burned into evidence photos). */
export function formatFix(fix: Fix | null): string | null {
  if (!fix) return null;
  const ns = fix.lat >= 0 ? 'N' : 'S';
  const ew = fix.lng >= 0 ? 'E' : 'W';
  const acc = fix.accuracy != null && Number.isFinite(fix.accuracy) ? ` ± ${Math.round(fix.accuracy)} m` : '';
  return `${Math.abs(fix.lat).toFixed(4)}° ${ns}, ${Math.abs(fix.lng).toFixed(4)}° ${ew}${acc}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2 Oct 2026, 14:32" in local time (Latin digits, for the burned-in seal). */
export function formatStampTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

/** Fit (w, h) inside MAX_EDGE, keeping the aspect ratio. */
export function fitSize(w: number, h: number, max = MAX_EDGE): { w: number; h: number } {
  if (!w || !h) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Burn "🔒 GPS + time sealed · <coords> · <time>" into the bottom of the canvas. */
export function stampCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, fix: Fix | null, at: Date) {
  const base = Math.max(12, Math.round(Math.min(w, h) * 0.028));
  const pad = Math.round(base * 0.8);
  const lines = [formatFix(fix) ?? 'GPS unavailable', formatStampTime(at) + ' · Atmos X'];
  ctx.save();
  ctx.font = `600 ${base}px ui-monospace, Menlo, Consolas, monospace`;
  const lh = Math.round(base * 1.35);
  const boxW = Math.min(w - pad * 2, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  const boxH = lh * lines.length + pad;
  const x = pad;
  const y = h - boxH - pad;
  ctx.fillStyle = 'rgba(0,24,46,0.62)';
  roundRect(ctx, x, y, boxW, boxH, Math.round(base * 0.6));
  ctx.fill();
  ctx.fillStyle = '#ACEC00';
  ctx.fillRect(x, y + Math.round(pad / 2), Math.max(2, Math.round(base / 6)), boxH - pad);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + Math.round(pad / 2) + i * lh, boxW - pad * 1.5));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('photo.unreadable'))), 'image/jpeg', JPEG_QUALITY);
  });
}

/** Draw any image source onto a fresh resized canvas, stamp it and encode it. */
export async function renderCapture(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  fix: Fix | null,
  at: Date,
  opts: { mirror?: boolean; stamp?: boolean } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const { w, h } = fitSize(srcW, srcH);
  if (!w || !h) throw new Error('photo.unreadable');
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('photo.unreadable');
  if (opts.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.stamp !== false) stampCanvas(ctx, w, h, fix, at);
  const blob = await toBlob(canvas);
  return { blob, width: w, height: h };
}

/** Grab the current frame of a playing <video>. */
export function captureVideoFrame(video: HTMLVideoElement, fix: Fix | null, at: Date, mirror = false) {
  return renderCapture(video, video.videoWidth, video.videoHeight, fix, at, { mirror });
}

/** Decode a picked/captured file (EXIF orientation respected), resize, stamp, encode. */
export async function fileToCapture(file: Blob, fix: Fix | null, at: Date, opts: { stamp?: boolean } = {}) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        return await renderCapture(bmp, bmp.width, bmp.height, fix, at, opts);
      } finally {
        bmp.close();
      }
    } catch {
      // fall through to <img> decoding (older Safari, HEIC handled by the OS picker)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('photo.unreadable'));
      el.src = url;
    });
    return await renderCapture(img, img.naturalWidth, img.naturalHeight, fix, at, opts);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Why the live viewfinder is unavailable (drives the fallback copy). */
export type CameraIssue = 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'busy' | 'failed';

export function cameraIssueFrom(e: unknown): CameraIssue {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'notfound';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'failed';
}

/** Can this page even try getUserMedia? (Phones need HTTPS; localhost counts as secure.) */
export function liveCameraSupport(): CameraIssue | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}
