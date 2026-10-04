'use client';
/**
 * S07 · Projection (port of apps/mobile/src/screens/map/projection.tsx): "do nothing" vs "with
 * plan" lines from useProjection (archive trend to 2040 minus ramped cooling), a horizon switch,
 * sliders for trees / cool roof m² / shade structures (debounced refetch) and the assumptions.
 * Slider defaults come from the active goal's plan for this zone when there is one.
 */
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { useDebounced } from '@/components/cz/hooks';
import { SkeletonCard, SourceChips } from '@/components/cz/states';
import { B } from '@/components/cz/tokens';
import { Card, CzButton, CzSlider, Screen, ScreenHeader, Seg, Spinner, Txt, View } from '@/components/cz/ui';
import { useTServer } from '@/i18n/server-text';
import { useActiveGoal, usePlan, useProjection, useZone, type ProjectionInput } from '@/lib/data/hooks';
import type { Projection } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { ZoneError } from './zone-not-found';

const CW = 346;
const CH = 220;
/** UI starting point when there's no plan yet (the user moves the sliders). */
const START: ProjectionInput = { trees: 100, roof_m2: 1000, shade: 2 };

function Chart({ p, end, goalYear }: { p: Projection; end: number; goalYear: number | null }) {
  const { c, f } = useCz();
  const t = useTranslations('zone.proj');
  const ch = useMemo(() => {
    const idx = p.years.map((y, i) => [y, i] as const).filter(([y]) => y <= end);
    if (idx.length < 2) return null;
    const ys = idx.map(([, i]) => i);
    const vals = ys.flatMap((i) => [p.without_c[i], p.with_c[i]]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    lo = Math.floor(lo * 4) / 4 - 0.25;
    hi = Math.ceil(hi * 4) / 4 + 0.25;
    const y0 = idx[0][0];
    const y1 = idx[idx.length - 1][0];
    const X = (y: number) => 40 + ((y - y0) / (y1 - y0)) * 296;
    const Y = (v: number) => 8 + ((hi - v) / (hi - lo)) * 186;
    const n1 = (n: number) => n.toFixed(1);
    const line = (arr: number[]) => idx.map(([y, i]) => `${n1(X(y))},${n1(Y(arr[i]))}`).join(' ');
    const gap = idx
      .map(([y, i]) => `${n1(X(y))},${n1(Y(p.without_c[i]))}`)
      .concat([...idx].reverse().map(([y, i]) => `${n1(X(y))},${n1(Y(p.with_c[i]))}`))
      .join(' ');
    const span = hi - lo;
    const step = span > 3 ? 1 : span > 1.5 ? 0.5 : 0.25;
    const yt: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) yt.push(v);
    const xstep = y1 - y0 > 8 ? 2 : 1;
    const xt: number[] = [];
    for (let y = y0; y <= y1; y += xstep) xt.push(y);
    const last = idx[idx.length - 1][1];
    return { X, Y, yt, xt, step, lineA: line(p.without_c), lineB: line(p.with_c), gap, y0, y1, a: p.without_c[last], b: p.with_c[last] };
  }, [p, end]);
  if (!ch) return null;
  const dp = ch.step < 1 ? 1 : 0;
  return (
    <div role="img" aria-label={t('chartA11y', { year: f.loc(ch.y1), a: f.deg(ch.a, 1), b: f.deg(ch.b, 1) })} style={{ width: '100%', aspectRatio: `${CW} / ${CH}` }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${CW} ${CH}`} aria-hidden style={{ direction: 'ltr' }}>
        {ch.yt.map((v) => (
          <g key={v}>
            <line x1={40} x2={340} y1={ch.Y(v)} y2={ch.Y(v)} stroke={c.line} strokeWidth={1} />
            <text x={0} y={ch.Y(v) + 3.5} fontSize={10} fill={c.ink2} fontFamily="var(--cz-font-body)">
              {f.deg(v, dp)}
            </text>
          </g>
        ))}
        {ch.xt.map((y) => (
          <text key={y} x={ch.X(y)} y={214} fontSize={10} fill={c.ink2} textAnchor="middle" fontFamily="var(--cz-font-body)">
            {f.loc(y)}
          </text>
        ))}
        {goalYear != null && goalYear >= ch.y0 && goalYear <= ch.y1 ? <line x1={ch.X(goalYear)} x2={ch.X(goalYear)} y1={6} y2={196} stroke={c.ink2} strokeWidth={1} strokeDasharray="3 4" /> : null}
        <polygon points={ch.gap} fill={B.blue} fillOpacity={0.14} />
        <polyline points={ch.lineA} fill="none" stroke={B.red} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={ch.lineB} fill="none" stroke={c.dark ? '#7C9CFF' : B.blue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={dashed ? { width: 12, borderTop: `1.5px dashed ${color}` } : { width: 14, height: 4, borderRadius: 2, backgroundColor: color }} />
      <Txt size={12} dim>
        {label}
      </Txt>
    </View>
  );
}

function RangeTile({ label, value, color }: { label: string; value: string; color: string }) {
  const { c } = useCz();
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: 20, padding: 14, gap: 4 }}>
      <Txt size={11.5} dim>
        {label}
      </Txt>
      <Txt size={22} num color={color} style={{ letterSpacing: -0.4 }} lines={1}>
        {value}
      </Txt>
    </View>
  );
}

function SliderRow({ label, value, valueText, min, max, step, onChange }: { label: string; value: number; valueText: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Txt size={13.5} w={600}>
          {label}
        </Txt>
        <Txt size={13.5} w={600} num>
          {valueText}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <CzSlider label={label} value={value} min={min} max={max} step={step} onChange={onChange} valueText={valueText} />
      </View>
    </View>
  );
}

export function ProjectionScreen({ id }: { id: string }) {
  const { c, f } = useCz();
  const t = useTranslations('zone.proj');
  const ts = useTServer();
  const zone = useZone(id);
  const goal = useActiveGoal();
  const g = goal.data && goal.data.zone_id === id ? goal.data : null;
  const plan = usePlan(g);

  const [input, setInput] = useState<ProjectionInput>(START);
  const [seeded, setSeeded] = useState(false);
  if (!seeded && plan.data) {
    const acts = plan.data.actions;
    const qty = (a: string) => acts.filter((x) => x.action_type === a).reduce((s, x) => s + x.qty, 0);
    setSeeded(true);
    // PlanAction.qty is in the action's unit: cool_roof counts 10 m² units (plan text says "2,920 m²" for 292).
    setInput({ trees: qty('plant_tree'), roof_m2: qty('cool_roof') * 10, shade: qty('shade_structure') });
  }
  const debounced = useDebounced(input, 400);
  const proj = useProjection(id, debounced);
  const p = proj.data;

  const lastYear = p?.years[p.years.length - 1] ?? 2040;
  const firstYear = p?.years[0] ?? 2026;
  const horizons = [Math.min(lastYear, firstYear + 4), Math.min(lastYear, firstYear + 9), lastYear].filter((v, i, a) => a.indexOf(v) === i);
  const [hz, setHz] = useState<number | null>(null);
  const end = hz != null && horizons.includes(hz) ? hz : lastYear;
  const at = p ? p.years.findIndex((y) => y === end) : -1;
  const goalYear = g ? new Date(g.by_date).getFullYear() : null;
  const name = zone.data?.name;

  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={name ? t('sub', { zone: name }) : t('subNoZone')} right={proj.isFetching && p ? <Spinner size={18} label={t('updating')} /> : undefined} />
      <Seg tone="card" height={40} value={end} onChange={setHz} label={t('horizon')} options={horizons.map((y) => ({ label: f.loc(y), value: y }))} style={{ padding: 4 }} />

      {!p ? (
        proj.error ? (
          <ZoneError error={proj.error} onRetry={() => void proj.refetch()} />
        ) : (
          <SkeletonCard lines={6} />
        )
      ) : (
        <>
          <Card pad={12} gap={10} style={{ paddingTop: 16, opacity: proj.isPlaceholderData ? 0.7 : 1, transition: 'opacity 0.2s ease' }}>
            <Chart p={p} end={end} goalYear={goalYear} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, paddingHorizontal: 4 }}>
              <LegendItem color={B.red} label={t('doNothing')} />
              <LegendItem color={c.dark ? '#7C9CFF' : B.blue} label={t('withPlan')} />
              <LegendItem color="rgba(1,63,246,0.3)" label={t('gap')} />
              {goalYear ? <LegendItem color={c.ink2} label={t('goalMark')} dashed /> : null}
            </View>
          </Card>
          {at >= 0 ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <RangeTile label={`${t('doNothing')} · ${f.loc(end)}`} value={f.deg(p.without_c[at], 1)} color={B.red} />
              <RangeTile label={`${t('withPlan')} · ${f.loc(end)}`} value={f.deg(p.with_c[at], 1)} color={c.leaf} />
            </View>
          ) : null}
        </>
      )}

      <Card gap={14}>
        <Txt display size={14} as="h2">
          {t('inputs')}
        </Txt>
        <SliderRow label={t('trees')} value={input.trees} valueText={f.num(input.trees)} min={0} max={2000} step={10} onChange={(v) => setInput((s) => ({ ...s, trees: v }))} />
        <SliderRow label={t('roof')} value={input.roof_m2} valueText={f.area2(input.roof_m2)} min={0} max={20000} step={100} onChange={(v) => setInput((s) => ({ ...s, roof_m2: v }))} />
        <SliderRow label={t('shade')} value={input.shade} valueText={f.num(input.shade)} min={0} max={30} step={1} onChange={(v) => setInput((s) => ({ ...s, shade: v }))} />
      </Card>

      {p?.assumptions.length ? (
        <Card gap={8}>
          <Txt size={14} w={600} as="h2">
            {t('assumptions')}
          </Txt>
          <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.assumptions.map((a, i) => (
              <li key={i} style={{ color: c.ink2 }}>
                <Txt size={12} dim style={{ lineHeight: 17 }}>
                  {ts(a)}
                </Txt>
              </li>
            ))}
          </ul>
          <SourceChips meta={p.meta} />
        </Card>
      ) : null}
      <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
        {t('rangesNote')}
      </Txt>
      <CzButton label={t('start')} icon="arrow" href={href('S08', undefined, { zone: id })} />
    </Screen>
  );
}
