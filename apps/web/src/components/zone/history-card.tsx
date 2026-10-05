'use client';
/**
 * S06 "Over the years" (replaces the prototype's fake LST hex timeline): 20 years of hot-season air
 * temperature from the Open-Meteo archive (ZoneDetail.history), day maxima or night minima, with
 * the 20-year average, a linear trend and a year slider. Labelled as air temperature (§4.4).
 */
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { B } from '@/components/cz/tokens';
import { Card, CzSlider, Note, Seg, StatTile, Txt, View } from '@/components/cz/ui';
import type { ZoneDetail } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';

type Kind = 'day' | 'night';
const W = 340;
const H = 180;
const L = 34;
const RGT = 8;
const TOP = 10;
const BOT = 22;

function fit(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, at: (x: number) => my + slope * (x - mx), mean: my };
}

export function HistoryCard({ zone }: { zone: ZoneDetail }) {
  const { c, f } = useCz();
  const t = useTranslations('zone.years');
  const [kind, setKind] = useState<Kind>('day');
  const pts = useMemo(
    () =>
      zone.history
        .map((h) => ({ year: h.year, v: kind === 'day' ? h.day_lst_c : h.night_lst_c }))
        .filter((p): p is { year: number; v: number } => p.v != null)
        .sort((a, b) => a.year - b.year),
    [zone.history, kind],
  );
  const last = pts[pts.length - 1]?.year ?? 0;
  const [sel, setSel] = useState<number | null>(null);
  const year = sel != null && pts.some((p) => p.year === sel) ? sel : last;

  const chart = useMemo(() => {
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p.year);
    const ys = pts.map((p) => p.v);
    const tr = fit(xs, ys);
    let lo = Math.min(...ys, tr.at(xs[0]), tr.at(xs[xs.length - 1]));
    let hi = Math.max(...ys, tr.at(xs[0]), tr.at(xs[xs.length - 1]));
    lo = Math.floor(lo * 2) / 2 - 0.5;
    hi = Math.ceil(hi * 2) / 2 + 0.5;
    const n = pts.length;
    const bw = (W - L - RGT) / n;
    const X = (i: number) => L + bw * i + bw / 2;
    const Y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (H - TOP - BOT);
    const step = hi - lo > 4 ? 1 : 0.5;
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) ticks.push(v);
    return { tr, X, Y, bw, lo, hi, ticks, base: Y(lo) };
  }, [pts]);

  if (!chart) {
    return (
      <Card style={{ marginHorizontal: 16 }}>
        <Txt display size={14} as="h2">
          {t('title')}
        </Txt>
        <Txt size={13} dim>
          {t('empty')}
        </Txt>
      </Card>
    );
  }

  const cur = pts.find((p) => p.year === year) ?? pts[pts.length - 1];
  const kindLabel = zone.history_kind === 'lst' ? t('kindLst') : t('kind');
  const stats: [string, string, string?][] = [
    [f.loc(cur.year), f.deg(cur.v, 1)],
    [t('vsAvg'), f.dC(cur.v - chart.tr.mean, 1), cur.v - chart.tr.mean > 0 ? B.red : c.leaf],
    [t('trend'), f.dC(chart.tr.slope * 10, 1)],
  ];

  return (
    <Card style={{ marginHorizontal: 16 }} pad={14}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 2, paddingTop: 2 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Txt display size={14} as="h2">
            {t('title')}
          </Txt>
          <Txt size={11.5} dim>
            {kindLabel}
          </Txt>
        </View>
        <Txt size={24} w={600} num style={{ letterSpacing: -0.2 }}>
          {f.loc(cur.year)}
        </Txt>
      </View>
      <Seg
        height={36}
        value={kind}
        onChange={setKind}
        options={[
          { label: t('layers.day'), value: 'day' },
          { label: t('layers.night'), value: 'night' },
        ]}
      />
      <div
        role="img"
        aria-label={t('chartA11y', { kind: kindLabel, from: f.loc(pts[0].year), to: f.loc(last), avg: f.deg(chart.tr.mean, 1), trend: f.dC(chart.tr.slope * 10, 2) })}
        style={{ width: '100%', aspectRatio: `${W} / ${H}` }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ direction: 'ltr', overflow: 'visible' }}>
          {chart.ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - RGT} y1={chart.Y(v)} y2={chart.Y(v)} stroke={c.line} strokeWidth={1} />
              <text x={L - 6} y={chart.Y(v) + 3.5} fontSize={10} fill={c.ink2} textAnchor="end" fontFamily="var(--cz-font-body)">
                {f.deg(v, chart.ticks.length > 1 && chart.ticks[1] - chart.ticks[0] < 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {pts.map((p, i) => {
            const on = p.year === cur.year;
            const above = p.v >= chart.tr.mean;
            return (
              <rect
                key={p.year}
                x={chart.X(i) - chart.bw * 0.34}
                width={chart.bw * 0.68}
                y={chart.Y(p.v)}
                height={Math.max(1, chart.base - chart.Y(p.v))}
                rx={2.5}
                fill={above ? B.red : B.blue}
                fillOpacity={on ? 1 : 0.42}
                onClick={() => setSel(p.year)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
          <line x1={L} x2={W - RGT} y1={chart.Y(chart.tr.mean)} y2={chart.Y(chart.tr.mean)} stroke={c.ink2} strokeWidth={1} strokeDasharray="3 4" />
          <text x={W - RGT} y={chart.Y(chart.tr.mean) - 4} fontSize={9.5} fill={c.ink2} textAnchor="end" fontFamily="var(--cz-font-body)">
            {t('avg')}
          </text>
          <line x1={chart.X(0)} x2={chart.X(pts.length - 1)} y1={chart.Y(chart.tr.at(pts[0].year))} y2={chart.Y(chart.tr.at(last))} stroke={c.ink} strokeWidth={2} strokeLinecap="round" />
          {[0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i) => (
            <text key={i} x={chart.X(i)} y={H - 6} fontSize={10} fill={c.ink2} textAnchor="middle" fontFamily="var(--cz-font-body)">
              {f.loc(pts[i].year)}
            </text>
          ))}
        </svg>
      </div>
      <CzSlider label={t('year')} min={pts[0].year} max={last} step={1} value={cur.year} onChange={(v) => setSel(Math.round(v))} valueText={f.loc(cur.year)} style={{ flex: 0, alignSelf: 'stretch', marginVertical: -6 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map(([label, val, col]) => (
          <StatTile key={label} label={label} value={val} color={col} />
        ))}
      </View>
      <Note>{t('note', { kind: kind === 'day' ? 'max' : 'min' })}</Note>
    </Card>
  );
}
