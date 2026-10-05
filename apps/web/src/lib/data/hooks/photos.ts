'use client';
/** Display URLs for photos stored in IndexedDB (`idb:` keys); other URLs pass through. */
import { useEffect, useState } from 'react';

import { getPhoto, isStoredPhoto } from '../local/store';

/**
 * Object URL for a stored photo, revoked on unmount / key change. http(s), data: and blob: URLs are
 * returned unchanged. Returns null while loading or when there is no photo.
 */
export function usePhotoUrl(url: string | null | undefined): string | null {
  const stored = isStoredPhoto(url) ? url : null;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!stored) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    getPhoto(stored)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ key: stored, url: objectUrl });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [stored]);

  if (!url) return null;
  if (!stored) return url;
  return loaded?.key === stored ? loaded.url : null;
}
