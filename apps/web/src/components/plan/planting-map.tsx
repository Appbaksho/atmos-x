'use client';

/**
 * Planting-spots map (S09 / S10): MapLibre basemap + `usePlantingSpots(zoneId)` GeoJSON, styled by
 * kind (open ground = lime, flat roofs = blue, street edge = orange). Geography never mirrors, so
 * the map stays LTR in Urdu (GeoMap sets direction: ltr).
 */
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { B, R, Txt, View } from '@/components/cz';
import type { LatLng, PlantingSpots } from '@/lib/data/types';

import { GeoMap, type MapReady } from './geo-map';

export const KIND_COLOR = { ground: B.lime, roof: B.blue, roadside: B.orange } as const;

const SRC = 'spots';

export function PlantingMap({ spots, center, zoneName, height = 260 }: { spots: PlantingSpots | null | undefined; center: LatLng; zoneName: string; height?: number }) {
  const t = useTranslations('plan');
  const [ready, setReady] = useState<MapReady | null>(null);

  useEffect(() => {
    if (!ready) return;
    const { map, ml } = ready;
    const data = spots ?? { type: 'FeatureCollection' as const, features: [] };
    const fc = { type: 'FeatureCollection' as const, features: data.features } as unknown as GeoJSON.FeatureCollection;
    const src = map.getSource(SRC) as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(fc);
    else {
      map.addSource(SRC, { type: 'geojson', data: fc });
      const color: import('maplibre-gl').ExpressionSpecification = ['match', ['get', 'kind'], 'ground', KIND_COLOR.ground, 'roof', KIND_COLOR.roof, KIND_COLOR.roadside];
      map.addLayer({ id: 'spots-fill', type: 'fill', source: SRC, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': 0.45 } });
      map.addLayer({ id: 'spots-line', type: 'line', source: SRC, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': color, 'line-width': 1.5 } });
      map.addLayer({
        id: 'spots-pt',
        type: 'circle',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': color, 'circle-radius': 6, 'circle-stroke-color': '#00182E', 'circle-stroke-width': 2 },
      });
    }
    // Fit to the spots (or keep the zone centre).
    const b = new ml.LngLatBounds();
    let any = false;
    for (const f of data.features) {
      const g = f.geometry;
      if (g.type === 'Point') {
        b.extend(g.coordinates as [number, number]);
        any = true;
      } else
        for (const ring of g.coordinates)
          for (const p of ring) {
            b.extend(p as [number, number]);
            any = true;
          }
    }
    if (any) map.fitBounds(b, { padding: 28, maxZoom: 17.5, duration: 0 });
  }, [ready, spots]);

  // Zone centre marker
  useEffect(() => {
    if (!ready) return;
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `width:16px;height:16px;border-radius:8px;background:${B.navy};border:3px solid ${B.lime};box-shadow:0 2px 6px rgba(0,16,32,.35)`;
    const m = new ready.ml.Marker({ element: el }).setLngLat([center.lng, center.lat]).addTo(ready.map);
    return () => void m.remove();
  }, [ready, center.lat, center.lng]);

  return (
    <GeoMap center={center} zoom={16} height={height} label={t('map.label', { zone: zoneName })} onReady={setReady}>
      <View style={{ position: 'absolute', start: 8, top: 8, end: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 5, pointerEvents: 'none' }}>
        {(['ground', 'roof', 'roadside'] as const).map((k) => (
          <MapChip key={k}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: KIND_COLOR[k] }} />
            <Txt size={10.5} color={B.white}>
              {t(`legend.${k}`)}
            </Txt>
          </MapChip>
        ))}
      </View>
    </GeoMap>
  );
}

export function MapChip({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,24,46,0.72)' }}>{children}</View>
  );
}
