'use client';
/** Client-only MapLibre view (next/dynamic, ssr:false) + the OpenStreetMap attribution chip. */
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { B } from '@/components/cz/tokens';
import { rn, type StyleProp } from '@/components/cz/style';
import { useCz } from '@/lib/prefs';

import type { MapViewProps } from './map-view';

export type { MapMarker, MapViewProps } from './map-view';

function MapLoading() {
  const { dark } = useCz();
  return <div aria-hidden className="cz-skeleton" style={{ position: 'absolute', inset: 0, backgroundColor: dark ? '#071C31' : '#E3E8EE' }} />;
}

const Inner = dynamic(() => import('./map-view'), { ssr: false, loading: MapLoading });

export function MapView(props: MapViewProps) {
  return <Inner {...props} />;
}

/** "© OpenStreetMap contributors" (+ OpenFreeMap / NASA GIBS when shown). Required on every map. */
export function MapAttribution({ gibs, style, tone = 'glass' }: { gibs?: boolean; style?: StyleProp; tone?: 'glass' | 'plain' }) {
  const t = useTranslations('map');
  const { c } = useCz();
  const glass = tone === 'glass';
  const link: React.CSSProperties = { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 };
  return (
    <div
      className="cz-view"
      style={rn([
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 4,
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 10,
          backgroundColor: glass ? 'rgba(0,24,46,0.55)' : 'transparent',
          color: glass ? B.white : c.ink2,
          fontSize: 10,
          lineHeight: '14px',
          pointerEvents: 'auto',
        },
        style,
      ])}>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={link}>
        {t('attribution.osm')}
      </a>
      <span aria-hidden>·</span>
      <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" style={link}>
        OpenFreeMap
      </a>
      {gibs ? (
        <>
          <span aria-hidden>·</span>
          <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noopener noreferrer" style={link}>
            NASA GIBS
          </a>
        </>
      ) : null}
    </div>
  );
}
