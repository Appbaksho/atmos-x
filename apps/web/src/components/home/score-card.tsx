'use client';
/**
 * S04 · Heat Score card (port of screens/home/score-card.tsx): 18-segment gauge for the user's own
 * zone (useZones → my_zone_id → useZone), cause chips that expand the server's explanation, and the
 * "+ Green" what-if slider driven by the zone's `what_if_green` (deterministic, from the server).
 * The prototype's hour switch is dropped: v0 has no per-hour scores.
 */
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { requireAccount } from '@/components/cz/account';
import { HScroll, SkeletonText, ErrorState } from '@/components/cz';
import { B, R, heatColor } from '@/components/cz/tokens';
import { Card, CzSlider, Divider, PillButton, Tap, Txt, View } from '@/components/cz/ui';
import { cellsAreaM2 } from '@/components/map/geo';
import { useTServer } from '@/i18n/server-text';
import type { I18nText, ZoneDetail } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

export type ScoreLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'vhigh';
export function scoreLevel(s: number): ScoreLevel {
  return s >= 85 ? 'vhigh' : s >= 70 ? 'high' : s >= 55 ? 'elevated' : s >= 40 ? 'moderate' : 'low';
}

const CAUSE_DOT: Record<string, string> = {
  'cause.sealed_surface': B.red,
  'cause.low_green': B.green,
  'cause.dense_buildings': B.yellow,
  'cause.wide_roads': B.orange,
  'cause.dark_roofs': B.orange,
};

/** Short chip label for a cause code ("Sealed 78%"). */
export function useCauseChip() {
  const t = useTranslations('home.causes');
  const { f } = useCz();
  return (c: I18nText) => {
    const key = c.code.replace(/^cause\./, '');
    const p = Object.fromEntries(Object.entries(c.params ?? {}).map(([k, v]) => [k, typeof v === 'number' ? f.loc(Math.round(v)) : v]));
    return t.has(key) ? t(key, p) : key;
  };
}

/** Cause chips; tapping one expands the full server sentence. */
export function CauseChips({ causes, bleed = 18 }: { causes: I18nText[]; bleed?: number }) {
  const { c } = useCz();
  const ts = useTServer();
  const chip = useCauseChip();
  const [open, setOpen] = useState(-1);
  if (!causes.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <HScroll gap={6} padded={false} style={{ marginHorizontal: -bleed, paddingHorizontal: bleed }}>
        {causes.map((cs, i) => {
          const on = open === i;
          const label = chip(cs);
          return (
            <Tap
              key={cs.code + i}
              aria-expanded={on}
              label={label}
              haptic
              onPress={() => setOpen(on ? -1 : i)}
              style={{ height: 30, minHeight: 30, paddingHorizontal: 10, borderRadius: R.pill, borderWidth: 1.5, borderColor: on ? c.ink : c.line, backgroundColor: on ? c.soft : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: CAUSE_DOT[cs.code] ?? B.orange, flexShrink: 0 }} />
              <Txt size={11.5} w={600} num>
                {label}
              </Txt>
            </Tap>
          );
        })}
      </HScroll>
      {open >= 0 && causes[open] ? (
        <Txt size={12} dim style={{ lineHeight: 17 }}>
          {ts(causes[open])}
        </Txt>
      ) : null}
    </View>
  );
}

/** "+ Green" what-if: scales the server's what_if_green linearly over 0–30 % added green cover. */
export function WhatIf({ zone, guest }: { zone: ZoneDetail; guest?: boolean }) {
  const { c, f } = useCz();
  const t = useTranslations('home');
  const [wi, setWi] = useState(0);
  const w = zone.what_if_green;
  const per = w.add_green_pct > 0 ? (zone.score - w.score_after) / w.add_green_pct : 0;
  const coolPer = w.add_green_pct > 0 ? w.lst_drop_c / w.add_green_pct : 0;
  const area = useMemo(() => cellsAreaM2(zone.h3), [zone.h3]);
  const score = Math.max(0, Math.round(zone.score - wi * per));
  // ≈ 25 m² of canopy per tree (same as the server's natural=tree rule, prompt-v0 §5.1)
  const trees = Math.max(0, Math.round(((wi / 100) * area) / 25 / 5) * 5);
  const text = wi ? t('wi', { t: f.num(trees), s: f.loc(score), d: f.dC(-wi * coolPer, 1) }) : t('wi0');
  return (
    <View style={{ gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.limeSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Txt size={12} w={600}>
          {t('whatIf')}
        </Txt>
        <CzSlider value={wi} onChange={setWi} min={0} max={30} step={1} label={t('whatIfA11y')} valueText={f.pct(wi)} />
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>
          <Txt size={13} w={700} num>
            {'+' + f.pct(wi)}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
        <Txt size={11.5} num style={{ flex: 1, lineHeight: 16 }}>
          <span aria-live="polite">{text}</span>
        </Txt>
        {wi > 0 ? (
          guest ? (
            <PillButton label={t('setGoal')} onPress={() => requireAccount(t('goalFeature'))} />
          ) : (
            <PillButton label={t('setGoal')} href={href('S08', undefined, { zone: zone.id })} />
          )
        ) : null}
      </View>
    </View>
  );
}

/** 18-segment semicircle (132×74), filled up to the score in heat colours. */
export function Gauge({ score }: { score: number | null }) {
  const { c, f } = useCz();
  const t = useTranslations('common');
  const segs = useMemo(() => {
    const N = 18;
    const cx = 66;
    const cy = 70;
    const Ro = 62;
    const Ri = 46;
    const gap = 0.03;
    const p = (a: number, rr: number) => (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1);
    return Array.from({ length: N }, (_, i) => {
      const a0 = Math.PI + (i * Math.PI) / N + gap;
      const a1 = Math.PI + ((i + 1) * Math.PI) / N - gap;
      return { d: 'M' + p(a0, Ro) + 'L' + p(a1, Ro) + 'L' + p(a1, Ri) + 'L' + p(a0, Ri) + 'Z', mid: ((i + 0.5) / N) * 100 };
    });
  }, []);
  const s = score ?? 0;
  return (
    <div
      className="cz-view"
      role="meter"
      aria-label={t('heatScore')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score ?? undefined}
      style={{ width: 132, height: 74, flexShrink: 0 }}>
      {/* The gauge reads left→right (cool→hot) in every language */}
      <svg width={132} height={74} viewBox="0 0 132 74" aria-hidden style={{ direction: 'ltr' }}>
        {segs.map((sg, i) => (
          <path key={i} d={sg.d} fill={score != null && sg.mid < s ? heatColor(sg.mid) : c.soft} style={{ transition: 'fill 0.3s ease' }} />
        ))}
      </svg>
      <View style={{ position: 'absolute', start: 0, end: 0, bottom: -2, alignItems: 'center' }}>
        <Txt size={26} w={600} num style={{ lineHeight: 28 }}>
          {score != null ? f.loc(score) : '–'}
        </Txt>
        <Txt size={10} dim style={{ lineHeight: 13 }}>
          / {f.loc(100)}
        </Txt>
      </View>
    </div>
  );
}

export function ScoreCard({ zone, loading, error, onRetry, guest, emptyHref }: { zone: ZoneDetail | null | undefined; loading: boolean; error?: unknown; onRetry?: () => void; guest?: boolean; emptyHref?: string }) {
  const { c, f } = useCz();
  const t = useTranslations('home');
  const cardStyle = { marginHorizontal: 16, marginTop: -4, paddingHorizontal: 18 };

  if (!zone) {
    if (error && !loading) return <ErrorState error={error} onRetry={onRetry} style={cardStyle} />;
    return (
      <Card style={cardStyle} gap={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Gauge score={null} />
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <Txt size={13} w={600}>
              {t('zone')} · {t('score')}
            </Txt>
            {loading ? (
              <SkeletonText lines={2} size={12} />
            ) : (
              <Tap role="link" href={emptyHref} label={t('seeMap')} style={{ alignSelf: 'flex-start' }}>
                <Txt size={12} dim>
                  {t('noZone')}
                </Txt>
              </Tap>
            )}
          </View>
        </View>
      </Card>
    );
  }

  const lvl = scoreLevel(zone.score);
  return (
    <Card style={cardStyle} gap={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Gauge score={zone.score} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Txt size={13} w={600}>
              {t('zone')} · {t('score')}
            </Txt>
            <View style={{ backgroundColor: heatColor(zone.score), paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.pill }}>
              <Txt size={11} w={600} color={zone.score >= 70 ? B.white : B.navy}>
                {t(`level.${lvl}`)}
              </Txt>
            </View>
          </View>
          <Txt size={12} dim lines={1}>
            {zone.name}
          </Txt>
          <Tap role="link" href={href('S06', { id: zone.id })} label={`${t('why')}: ${zone.name}`} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
            <Txt size={13} w={600} color={c.leaf}>
              {t('why')} {f.rtl ? '←' : '→'}
            </Txt>
          </Tap>
        </View>
      </View>
      <Divider />
      <View style={{ gap: 10, marginTop: -4 }}>
        <CauseChips causes={zone.causes} />
        <WhatIf zone={zone} guest={guest} />
      </View>
    </Card>
  );
}
