'use client';
/**
 * MapLibre GL map (client only; load it through ./map-view-lazy, which uses next/dynamic with
 * ssr:false). Basemap: OpenFreeMap / OpenStreetMap (map-style.ts). Overlays: H3 heat hexes coloured
 * by the Heat Score scale (opacity 0.55), the scan circle, the user dot, the hottest-zone outline,
 * an optional NASA GIBS monthly LST raster, and React-rendered markers (portals).
 */
import 'maplibre-gl/dist/maplibre-gl.css';

import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LayerSpecification, Map as MlMap, Marker } from 'maplibre-gl';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { B } from '@/components/cz/tokens';
import { configureMaplibre } from '@/lib/maplibre';
import { useCz } from '@/lib/prefs';
import type { HexCell, LatLng, ZoneSummary } from '@/lib/data/types';

import { cellsBounds, circleBounds, circlePolygon, hexCollection, zoneCollection } from './geo';
import { loadStyle } from './map-style';

/** NASA GIBS MODIS Terra monthly daytime LST (from apps/mobile/src/lib/nasa.ts). */
const GIBS_LST_TILE_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png';

const HEX_OPACITY = 0.55;
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export type MapMarker = {
  id: string;
  at: LatLng;
  node: React.ReactNode;
  anchor?: 'center' | 'bottom' | 'left' | 'right' | 'top';
  offset?: [number, number];
};

export type MapViewProps = {
  center: LatLng;
  radiusM: number;
  hexes?: HexCell[] | null;
  zones?: ZoneSummary[] | null;
  /** Fit to these cells instead of the scan circle (zone hero) */
  focusCells?: string[] | null;
  /** Outline this zone instead of rank 1 */
  outlineZoneId?: string | null;
  me?: LatLng | null;
  showCircle?: boolean;
  /** NASA GIBS monthly LST overlay */
  gibs?: boolean;
  /** Changing this replays the hex fade-in (scan animation) */
  animateKey?: string | number | null;
  /** Pulse the scan circle while a scan runs */
  scanning?: boolean;
  interactive?: boolean;
  padding?: { top: number; bottom: number; left: number; right: number };
  onHex?: (h3: string, zoneId: string) => void;
  markers?: MapMarker[];
  label: string;
  style?: React.CSSProperties;
  className?: string;
  /** Fired when the map can't be created (no WebGL) */
  onFail?: () => void;
};

type Snapshot = Pick<MapViewProps, 'center' | 'radiusM' | 'hexes' | 'zones' | 'me' | 'showCircle' | 'gibs' | 'outlineZoneId'> & { dark: boolean };

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** First label layer above every fill/line layer (so overlays sit over roads and buildings, under labels). */
function firstSymbolId(map: MlMap): string | undefined {
  const layers = map.getStyle().layers ?? [];
  let last = -1;
  layers.forEach((l, i) => {
    if (l.type !== 'symbol') last = i;
  });
  return layers.slice(last + 1).find((l) => l.type === 'symbol')?.id;
}

function setSource(map: MlMap, id: string, data: GeoJSON.GeoJSON) {
  const src = map.getSource<GeoJSONSource>(id);
  if (src) void src.setData(data);
}

/** Add (or re-add after a style swap) every overlay source and layer. */
function addOverlays(map: MlMap, s: Snapshot) {
  if (map.getSource('cz-hex')) return;
  const before = firstSymbolId(map);
  const add = (layer: LayerSpecification, below = before) => map.addLayer(layer, below);
  const lineColor = s.dark ? 'rgba(234,241,248,0.55)' : 'rgba(255,255,255,0.85)';

  map.addSource('cz-gibs', { type: 'raster', tiles: [GIBS_LST_TILE_URL], tileSize: 256, maxzoom: 6, attribution: 'NASA GIBS (MODIS LST)' });
  add({ id: 'cz-gibs', type: 'raster', source: 'cz-gibs', layout: { visibility: s.gibs ? 'visible' : 'none' }, paint: { 'raster-opacity': 0.7 } });

  map.addSource('cz-circle', { type: 'geojson', data: circlePolygon(s.center, s.radiusM) });
  add({ id: 'cz-circle-fill', type: 'fill', source: 'cz-circle', layout: { visibility: s.showCircle === false ? 'none' : 'visible' }, paint: { 'fill-color': B.lime, 'fill-opacity': 0.08 } });

  map.addSource('cz-hex', { type: 'geojson', data: s.hexes?.length ? hexCollection(s.hexes, s.zones ?? []) : EMPTY });
  add({ id: 'cz-hex-fill', type: 'fill', source: 'cz-hex', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': HEX_OPACITY } });
  add({ id: 'cz-hex-line', type: 'line', source: 'cz-hex', paint: { 'line-color': lineColor, 'line-width': 1, 'line-opacity': 1 } });

  map.addSource('cz-zones', { type: 'geojson', data: s.zones?.length ? zoneCollection(s.zones) : EMPTY });
  const outline: maplibregl.FilterSpecification = s.outlineZoneId ? ['==', ['get', 'id'], s.outlineZoneId] : ['==', ['get', 'rank'], 1];
  add({ id: 'cz-zone-casing', type: 'line', source: 'cz-zones', filter: outline, paint: { 'line-color': B.navy, 'line-width': 6, 'line-opacity': 0.55 } });
  add({ id: 'cz-zone-line', type: 'line', source: 'cz-zones', filter: outline, paint: { 'line-color': B.lime, 'line-width': 3 } });

  add({
    id: 'cz-circle-line',
    type: 'line',
    source: 'cz-circle',
    layout: { visibility: s.showCircle === false ? 'none' : 'visible' },
    paint: { 'line-color': B.lime, 'line-width': 2, 'line-dasharray': [3, 3] },
  });

  map.addSource('cz-me', { type: 'geojson', data: s.me ? { type: 'Point', coordinates: [s.me.lng, s.me.lat] } : EMPTY });
  map.addLayer({ id: 'cz-me-halo', type: 'circle', source: 'cz-me', paint: { 'circle-radius': 14, 'circle-color': 'rgba(255,255,255,0.28)', 'circle-stroke-color': 'rgba(255,255,255,0.9)', 'circle-stroke-width': 1.2 } });
  map.addLayer({ id: 'cz-me', type: 'circle', source: 'cz-me', paint: { 'circle-radius': 7, 'circle-color': B.blue, 'circle-stroke-color': B.white, 'circle-stroke-width': 3 } });
}

export default function MapView(props: MapViewProps) {
  const { center, radiusM, hexes, zones, focusCells, outlineZoneId, me, showCircle = true, gibs = false, animateKey, scanning, interactive = true, padding, onHex, markers, label, style, className, onFail } = props;
  const { dark } = useCz();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const snap = useRef<Snapshot>({ center, radiusM, hexes, zones, me, showCircle, gibs, outlineZoneId, dark });
  const onHexRef = useRef(onHex);
  const padRef = useRef(padding);
  // Latest props for map event handlers (style swaps re-add overlays from this snapshot).
  useEffect(() => {
    snap.current = { center, radiusM, hexes, zones, me, showCircle, gibs, outlineZoneId, dark };
    onHexRef.current = onHex;
    padRef.current = padding;
  });
  const styleDark = useRef<boolean | null>(null);
  const fitted = useRef(false);

  /* ── create ── */
  useEffect(() => {
    let alive = true;
    let map: MlMap | null = null;
    (async () => {
      configureMaplibre(maplibregl);
      const s0 = snap.current;
      const st = await loadStyle(s0.dark);
      if (!alive || !box.current) return;
      let m: MlMap;
      try {
        m = new maplibregl.Map({
          container: box.current,
          style: st,
          center: [s0.center.lng, s0.center.lat],
          zoom: 15,
          attributionControl: false,
          interactive,
          dragRotate: false,
          touchPitch: false,
          pitchWithRotate: false,
          maxPitch: 0,
          fadeDuration: 0,
          renderWorldCopies: false,
        });
      } catch {
        setFailed(true);
        onFail?.();
        return;
      }
      map = m;
      styleDark.current = s0.dark;
      m.touchZoomRotate?.disableRotation();
      m.keyboard?.disableRotation();
      mapRef.current = m;
      // Ready as soon as the style (and our overlays) are in: 'load' waits for every tile.
      m.on('style.load', () => {
        addOverlays(m, snap.current);
        if (alive) setReady(true);
      });
      m.on('click', 'cz-hex-fill', (e) => {
        const f = e.features?.[0];
        if (f) onHexRef.current?.(String(f.properties.h3), String(f.properties.zone ?? ''));
      });
      m.on('mouseenter', 'cz-hex-fill', () => {
        if (onHexRef.current) m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'cz-hex-fill', () => {
        m.getCanvas().style.cursor = '';
      });
    })();
    return () => {
      alive = false;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once; props flow in through effects below
  }, []);

  /* ── theme swap ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || styleDark.current === dark) return;
    styleDark.current = dark;
    let alive = true;
    loadStyle(dark).then((st) => {
      if (alive && mapRef.current === map) map.setStyle(st, { diff: false });
    });
    return () => {
      alive = false;
    };
  }, [dark, ready]);

  /* ── data ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource('cz-hex')) return;
    setSource(map, 'cz-hex', hexes?.length ? hexCollection(hexes, zones ?? []) : EMPTY);
    setSource(map, 'cz-zones', zones?.length ? zoneCollection(zones) : EMPTY);
  }, [hexes, zones, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('cz-zone-line')) return;
    const f: maplibregl.FilterSpecification = outlineZoneId ? ['==', ['get', 'id'], outlineZoneId] : ['==', ['get', 'rank'], 1];
    map.setFilter('cz-zone-line', f);
    map.setFilter('cz-zone-casing', f);
  }, [outlineZoneId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource('cz-circle')) return;
    setSource(map, 'cz-circle', circlePolygon(center, radiusM));
    const vis = showCircle ? 'visible' : 'none';
    map.setLayoutProperty('cz-circle-fill', 'visibility', vis);
    map.setLayoutProperty('cz-circle-line', 'visibility', vis);
  }, [center, radiusM, showCircle, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource('cz-me')) return;
    setSource(map, 'cz-me', me ? { type: 'Point', coordinates: [me.lng, me.lat] } : EMPTY);
  }, [me, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('cz-gibs')) return;
    map.setLayoutProperty('cz-gibs', 'visibility', gibs ? 'visible' : 'none');
  }, [gibs, ready]);

  /* ── camera ── */
  const focusKey = focusCells?.join(',') ?? '';
  const padKey = padding ? `${padding.top},${padding.bottom},${padding.left},${padding.right}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const b = focusKey ? cellsBounds(focusKey.split(',')) : circleBounds(center, radiusM);
    if (!b) return;
    const pad = padRef.current ?? { top: 40, bottom: 40, left: 24, right: 24 };
    // fitBounds throws when the padding is larger than the canvas
    const c = map.getContainer();
    if (pad.top + pad.bottom >= c.clientHeight - 40 || pad.left + pad.right >= c.clientWidth - 40) return;
    map.fitBounds(b, { padding: pad, duration: fitted.current && !reducedMotion() ? 600 : 0, maxZoom: 17.5 });
    fitted.current = true;
  }, [center, radiusM, focusKey, padKey, ready]);

  /* ── scan animation: hexes fade in from coolest to hottest ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('cz-hex-fill') || !hexes?.length) return;
    if (reducedMotion() || animateKey == null) {
      map.setPaintProperty('cz-hex-fill', 'fill-opacity', HEX_OPACITY);
      map.setPaintProperty('cz-hex-line', 'line-opacity', 1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const DUR = 1600;
    const step = (now: number) => {
      const p = Math.min(1.3, ((now - t0) / DUR) * 1.3);
      const k: maplibregl.ExpressionSpecification = ['min', 1, ['max', 0, ['*', 4, ['-', p, ['get', 'order']]]]];
      if (!mapRef.current?.getLayer('cz-hex-fill')) return;
      map.setPaintProperty('cz-hex-fill', 'fill-opacity', ['*', HEX_OPACITY, k]);
      map.setPaintProperty('cz-hex-line', 'line-opacity', k);
      if (p < 1.3) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replay only when the key changes
  }, [animateKey, ready]);

  /* ── scanning pulse ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('cz-circle-fill')) return;
    if (!scanning || reducedMotion()) {
      map.setPaintProperty('cz-circle-fill', 'fill-opacity', 0.08);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      if (!mapRef.current?.getLayer('cz-circle-fill')) return;
      const a = 0.08 + 0.14 * (0.5 + 0.5 * Math.sin((now - t0) / 260));
      map.setPaintProperty('cz-circle-fill', 'fill-opacity', a);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (mapRef.current?.getLayer('cz-circle-fill')) map.setPaintProperty('cz-circle-fill', 'fill-opacity', 0.08);
    };
  }, [scanning, ready]);

  /* ── markers (React portals) ── */
  const live = useRef(new Map<string, { el: HTMLDivElement; marker: Marker }>());
  const [els, setEls] = useState<[string, HTMLDivElement][]>([]);
  const markerKey = useMemo(() => (markers ?? []).map((m) => `${m.id}@${m.at.lat.toFixed(6)},${m.at.lng.toFixed(6)}`).join('|'), [markers]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const want = new Map((markers ?? []).map((m) => [m.id, m]));
    for (const [id, v] of live.current) {
      if (!want.has(id)) {
        v.marker.remove();
        live.current.delete(id);
      }
    }
    for (const m of want.values()) {
      const cur = live.current.get(m.id);
      if (cur) cur.marker.setLngLat([m.at.lng, m.at.lat]);
      else {
        const el = document.createElement('div');
        const marker = new maplibregl.Marker({ element: el, anchor: m.anchor ?? 'center', offset: m.offset }).setLngLat([m.at.lng, m.at.lat]).addTo(map);
        live.current.set(m.id, { el, marker });
      }
    }
    setEls([...live.current.entries()].map(([id, v]) => [id, v.el]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on ids + positions
  }, [markerKey, ready]);
  useEffect(() => {
    const cur = live.current;
    return () => {
      for (const v of cur.values()) v.marker.remove();
      cur.clear();
    };
  }, []);
  const nodes = new Map((markers ?? []).map((m) => [m.id, m.node]));

  return (
    <div
      role="region"
      aria-label={label}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', backgroundColor: dark ? '#071C31' : '#E8ECEF', ...style }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {failed ? <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${B.photoBg2}, ${B.navy})` }} /> : null}
      {els.map(([id, el]) => createPortal(nodes.get(id) ?? null, el, id))}
    </div>
  );
}
