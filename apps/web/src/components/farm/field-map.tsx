'use client';
/**
 * F03 field map (V0-7): MapLibre GL on OpenFreeMap (OpenStreetMap) with one labelled pill per saved
 * field. In edit mode a tap on the map (or dragging the pin) places the field. Falls back to raster
 * tile.openstreetmap.org when the vector style can't load. maplibre-gl is loaded on the client only.
 */
import 'maplibre-gl/dist/maplibre-gl.css';

import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { B, I, Icon, Spinner, Txt, useCz, View } from '@/components/cz';
import type { FarmField, LatLng } from '@/lib/data/types';

const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK || '';
const OSM_RASTER = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

let workerSet = false;

export type FieldMapProps = {
  fields: FarmField[];
  selectedId?: string | null;
  onSelect?: (field: FarmField) => void;
  /** Edit mode: the pin being placed */
  pin?: LatLng | null;
  onPin?: (p: LatLng) => void;
  /** Initial centre when there is nothing to show */
  center: LatLng;
  height?: number;
  hint?: string;
};

function pillEl(name: string, on: boolean, alert: boolean): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cz-field-pill';
  el.setAttribute('aria-label', name);
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
  Object.assign(el.style, {
    height: '30px',
    padding: '0 10px',
    borderRadius: '999px',
    border: `${on ? 2 : 1}px solid ${on ? B.lime : 'rgba(255,255,255,0.35)'}`,
    background: on ? B.navy : 'rgba(0,24,46,0.72)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    font: '600 11.5px/1 var(--cz-font-body, system-ui)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
  });
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '8px',
    height: '8px',
    borderRadius: '4px',
    background: alert ? B.red : B.lime,
    flexShrink: '0',
  });
  const txt = document.createElement('span');
  txt.textContent = name;
  el.append(dot, txt);
  return el;
}

function pinEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.innerHTML =
    '<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 43s15-14.6 15-26A15 15 0 0 0 2 17c0 11.4 15 26 15 26z" fill="#ACEC00" stroke="#00182E" stroke-width="2.5"/><circle cx="17" cy="17" r="5.5" fill="#00182E"/></svg>';
  el.style.cursor = 'grab';
  return el;
}

export function FieldMap({ fields, selectedId, onSelect, pin, onPin, center, height = 330, hint }: FieldMapProps) {
  const { raw } = useCz();
  const t = useTranslations('farm.fields');
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<MlMarker[]>([]);
  const pinMarker = useRef<MlMarker | null>(null);
  const ml = useRef<typeof import('maplibre-gl') | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPinRef = useRef(onPin);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onPinRef.current = onPin;
    onSelectRef.current = onSelect;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let fellBack = false;
    void import('maplibre-gl')
      .catch(() => null)
      .then((lib) => {
        if (!lib) return setFailed(true);
        if (cancelled || !box.current) return;
        ml.current = lib;
        // maplibre-gl v6 resolves its module worker next to its own chunk, which 404s under Turbopack
        // (same fix as V0-4's map-view: a version-matched CDN worker, overridable by env).
        if (!workerSet) {
          workerSet = true;
          lib.setWorkerUrl(process.env.NEXT_PUBLIC_MAPLIBRE_WORKER_URL || `https://cdn.jsdelivr.net/npm/maplibre-gl@${lib.getVersion()}/dist/maplibre-gl-worker.mjs`);
        }
        const style = raw.dark && STYLE_DARK ? STYLE_DARK : STYLE;
        let m: MlMap;
        try {
          m = new lib.Map({
            container: box.current,
            style,
            center: [center.lng, center.lat],
            zoom: 13,
            attributionControl: {
              compact: true,
              customAttribution: '© OpenStreetMap contributors',
            },
            cooperativeGestures: false,
          });
        } catch {
          // No WebGL (old device, blocked GPU): the list and "Use my location" still work.
          setFailed(true);
          return;
        }
        m.on('error', () => {
          if (fellBack || m.isStyleLoaded()) return;
          fellBack = true;
          m.setStyle(OSM_RASTER);
        });
        m.on('load', () => {
          if (cancelled) return;
          setReady(true);
          // Keep the attribution collapsed to the (i) button on small maps.
          box.current?.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
        });
        m.on('click', (e) =>
          onPinRef.current?.({
            lat: +e.lngLat.lat.toFixed(6),
            lng: +e.lngLat.lng.toFixed(6),
          }),
        );
        map.current = m;
      });
    return () => {
      cancelled = true;
      markers.current.forEach((x) => x.remove());
      pinMarker.current?.remove();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; centre/pins update below
  }, []);

  // Field pills (hidden while placing a pin).
  useEffect(() => {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib || !ready) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    if (pin !== undefined) return;
    for (const fl of fields) {
      const el = pillEl(fl.name, fl.id === selectedId, false);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelectRef.current?.(fl);
      });
      markers.current.push(new lib.Marker({ element: el }).setLngLat([fl.location.lng, fl.location.lat]).addTo(m));
    }
  }, [fields, selectedId, ready, pin]);

  // Edit pin.
  useEffect(() => {
    const m = map.current;
    const lib = ml.current;
    if (!m || !lib || !ready) return;
    if (!pin) {
      pinMarker.current?.remove();
      pinMarker.current = null;
      return;
    }
    if (!pinMarker.current) {
      const mk = new lib.Marker({
        element: pinEl(),
        draggable: true,
        anchor: 'bottom',
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLngLat();
        onPinRef.current?.({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
      });
      pinMarker.current = mk;
    } else {
      pinMarker.current.setLngLat([pin.lng, pin.lat]);
    }
  }, [pin, ready]);

  // Follow the selection / pin.
  const target = pin ?? fields.find((x) => x.id === selectedId)?.location ?? fields[0]?.location ?? center;
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.easeTo({ center: [target.lng, target.lat], duration: 500 });
  }, [target.lat, target.lng, ready]);

  return (
    <View
      style={{
        height,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: B.photoBg,
      }}
      role="region"
      label={t('mapA11y')}
    >
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {failed ? (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 24,
          }}
        >
          <Icon d={I.map} size={28} color={B.lime} />
          <Txt size={12.5} color={B.white} center>
            {t('mapOff')}
          </Txt>
        </View>
      ) : !ready ? (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spinner color={B.lime} />
        </View>
      ) : null}
      {hint && !failed ? (
        <View
          style={{
            position: 'absolute',
            start: 12,
            end: 12,
            bottom: 30,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: 'rgba(0,24,46,0.78)',
            pointerEvents: 'none',
          }}
        >
          <Txt size={12.5} color={B.white}>
            {hint}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
