'use client';

/**
 * Small client-only MapLibre wrapper for the Plan/Act screens (planting spots, nurseries).
 * maplibre-gl is imported lazily inside an effect so it never runs on the server and stays out of
 * the first-load bundle. Consumers get `(map, ml)` through `onReady` and manage their own sources
 * and layers in effects; the map remounts when the theme flips (keyed by `dark`).
 *
 * Basemap: NEXT_PUBLIC_MAP_STYLE_URL (OpenFreeMap / OpenStreetMap); dark mode uses
 * NEXT_PUBLIC_MAP_STYLE_URL_DARK, else OpenFreeMap "dark". Attribution stays visible (compact).
 */
import 'maplibre-gl/dist/maplibre-gl.css';

import { useEffect, useRef, useState } from 'react';

import { B, Spinner, Txt, View, useCz, type StyleProp } from '@/components/cz';
import type { LatLng } from '@/lib/data/types';
import { configureMaplibre } from '@/lib/maplibre';

export type ML = typeof import('maplibre-gl');
export type MLMap = import('maplibre-gl').Map;
export type MapReady = { map: MLMap; ml: ML };

const LIGHT_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK || 'https://tiles.openfreemap.org/styles/dark';

export function GeoMap({
  center,
  zoom = 15.5,
  height,
  label,
  onReady,
  interactive = true,
  style,
  children,
}: {
  center: LatLng;
  zoom?: number;
  height: number | string;
  /** Accessible description of the map */
  label: string;
  onReady?: (r: MapReady | null) => void;
  /** false = static preview (no pan/zoom); taps still reach layers via `click` handlers */
  interactive?: boolean;
  style?: StyleProp;
  /** Overlay content (legend chips, toasts) drawn above the canvas */
  children?: React.ReactNode;
}) {
  const { dark, raw } = useCz();
  return (
    <View
      role="region"
      label={label}
      style={[{ height, borderRadius: 18, overflow: 'hidden', backgroundColor: raw.soft, direction: 'ltr' }, style]}>
      <MapCanvas key={dark ? 'dark' : 'light'} dark={dark} center={center} zoom={zoom} onReady={onReady} interactive={interactive} />
      {children}
    </View>
  );
}

function MapCanvas({ dark, center, zoom, onReady, interactive }: { dark: boolean; center: LatLng; zoom: number; onReady?: (r: MapReady | null) => void; interactive: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });
  const first = useRef({ center, zoom });

  useEffect(() => {
    let map: MLMap | null = null;
    let cancelled = false;
    (async () => {
      try {
        const ml: ML = await import('maplibre-gl');
        if (cancelled || !el.current) return;
        configureMaplibre(ml);
        map = new ml.Map({
          container: el.current,
          style: dark ? DARK_STYLE : LIGHT_STYLE,
          center: [first.current.center.lng, first.current.center.lat],
          zoom: first.current.zoom,
          attributionControl: { compact: true },
          interactive,
          cooperativeGestures: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        if (interactive) map.touchZoomRotate.disableRotation();
        map.on('error', () => {});
        map.once('load', () => {
          if (cancelled || !map) return;
          setState('ready');
          // Compact attribution starts expanded; keep it as the (i) button so it doesn't cover the legend.
          el.current?.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
          ready.current?.({ map, ml });
        });
      } catch (e) {
        console.warn('[atmos] map failed to start', e);
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
      ready.current?.(null);
      map?.remove();
    };
  }, [dark, interactive]);

  return (
    <>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {state !== 'ready' ? (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
          {state === 'loading' ? <Spinner color={B.lime} /> : <Txt size={12} dim>Map unavailable</Txt>}
        </View>
      ) : null}
    </>
  );
}
