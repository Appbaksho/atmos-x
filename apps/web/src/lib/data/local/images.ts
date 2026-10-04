/**
 * Client-side photo resizing (browser only). Stored copy: ≤ 1600 px JPEG blob in IndexedDB.
 * AI copy: ≤ 768 px JPEG data URL (prompt-v0.md §5.4).
 */
import { DataError } from '../errors';
import type { PreparedPhoto } from './actions';

export const STORE_MAX_PX = 1600;
export const AI_MAX_PX = 768;

/** Target size keeping aspect ratio, never upscaling. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

type Source = { el: CanvasImageSource; w: number; h: number; close: () => void };

async function decode(blob: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { el: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img> (older Safari)
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { el: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new DataError('photo.unreadable', 'This photo could not be read', 400);
  }
}

function draw(src: Source, max: number): HTMLCanvasElement {
  const { w, h } = fitWithin(src.w, src.h, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new DataError('photo.canvas', 'Canvas is unavailable', 500);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.el, 0, 0, w, h);
  return canvas;
}

const toBlob = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new DataError('photo.encode', 'Could not encode the photo', 500))), 'image/jpeg', quality),
  );

export async function resizeToBlob(photo: Blob, max = STORE_MAX_PX, quality = 0.85): Promise<Blob> {
  const src = await decode(photo);
  try {
    return await toBlob(draw(src, max), quality);
  } finally {
    src.close();
  }
}

export async function resizeToDataUrl(photo: Blob, max = AI_MAX_PX, quality = 0.8): Promise<string> {
  const src = await decode(photo);
  try {
    return draw(src, max).toDataURL('image/jpeg', quality);
  } finally {
    src.close();
  }
}

/** One decode, two outputs: the stored ≤ 1600 px blob and the ≤ 768 px data URL for the AI. */
export async function preparePhoto(photo: Blob): Promise<PreparedPhoto> {
  const src = await decode(photo);
  try {
    const stored = await toBlob(draw(src, STORE_MAX_PX), 0.85);
    const preview = draw(src, AI_MAX_PX).toDataURL('image/jpeg', 0.8);
    return { stored, preview };
  } finally {
    src.close();
  }
}
