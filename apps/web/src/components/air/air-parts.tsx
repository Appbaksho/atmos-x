'use client';
/** Air-quality building blocks for S26 (V0-7): the EPA band bar with the WHO line and the forecast chart. */
import { useTranslations } from 'next-intl';

import { AQI_COLORS, B, pmBand, useCz, View } from '@/components/cz';
import type { Air } from '@/lib/data/types';

/** Scale maximum for the band bar, μg/m³. */
export const MAXP = 150;
/** WHO 2021 24-hour PM2.5 guideline, μg/m³. */
export const WHO = 15;
const px = (v: number) => Math.min(100, (v / MAXP) * 100);
/** US EPA 2024 band widths in μg/m³ up to MAXP (Good … Very unhealthy). */
const BAND_W = [9, 26.4, 20, 70, 24.6];

/** Horizontal AQI bands with the current-value marker and the WHO tick. */
export function BandBar({ pm, label }: { pm: number; label: string }) {
  const { c } = useCz();
  const t = useTranslations('air');
  return (
    <View style={{ paddingTop: 16 }} role="img" label={label}>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }} aria-hidden>
        {BAND_W.map((w, i) => (
          <View key={i} style={{ flex: w, backgroundColor: AQI_COLORS[i] }} />
        ))}
      </View>
      <View aria-hidden style={{ position: 'absolute', top: 10, width: 4, height: 22, borderRadius: 2, marginStart: -2, start: `${px(pm)}%`, backgroundColor: c.ink }} />
      <View aria-hidden style={{ position: 'absolute', top: 0, width: 60, marginStart: -30, alignItems: 'center', start: `${px(WHO)}%` }}>
        <span style={{ fontSize: 10, fontWeight: 700, lineHeight: '13px', color: c.leaf, whiteSpace: 'nowrap' }}>{t('who')}</span>
      </View>
    </View>
  );
}

/** Daily PM2.5 bars with the dashed WHO line (viewBox 346×150, ported from the 48 h chart). */
export function ForecastChart({ days, label }: { days: Air['forecast']; label: string }) {
  const { c, f } = useCz();
  const t = useTranslations('air');
  const top = Math.max(100, ...days.map((d) => d.pm25 * 1.15));
  const yS = (v: number) => 128 - (v / top) * 110;
  const whoY = yS(WHO);
  const n = Math.max(1, days.length);
  const slot = 332 / n;
  const bw = Math.min(34, slot * 0.62);
  return (
    <View role="img" label={label} style={{ width: '100%', maxWidth: 520, alignSelf: 'center', aspectRatio: 346 / 150 }}>
      <svg width="100%" height="100%" viewBox="0 0 346 150" aria-hidden>
        {days.map((d, i) => {
          const x = 8 + i * slot + (slot - bw) / 2;
          const y = yS(d.pm25);
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={bw} height={Math.max(2, 128 - y)} rx={6} fill={AQI_COLORS[pmBand(d.pm25)]} />
              <text x={x + bw / 2} y={y - 4} fontSize={10} fontWeight={600} fill={c.ink} textAnchor="middle" style={{ fontFamily: 'var(--cz-font-body)' }}>
                {f.loc(Math.round(d.pm25))}
              </text>
              <text x={x + bw / 2} y={146} fontSize={9.5} fill={c.ink2} textAnchor="middle" style={{ fontFamily: 'var(--cz-font-body)' }}>
                {i === 0 ? t('today') : f.weekday(d.date)}
              </text>
            </g>
          );
        })}
        <line x1={8} x2={340} y1={whoY} y2={whoY} stroke={c.dark ? B.lime : B.blue} strokeWidth={1.5} strokeDasharray="4 4" />
        <text x={340} y={whoY - 4} fontSize={9.5} fontWeight={600} fill={c.dark ? B.lime : B.blue} stroke={c.card} strokeWidth={3} paintOrder="stroke" textAnchor="end" style={{ fontFamily: 'var(--cz-font-body)' }}>
          {`WHO ${f.loc(WHO)}`}
        </text>
      </svg>
    </View>
  );
}
