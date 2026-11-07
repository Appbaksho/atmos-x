'use client';
/**
 * S04 hero (port of screens/home/home.tsx Hero): live conditions over the neighbourhood aerial.
 * Warnings first, then air temperature, feels-like, heat-risk band, BMD-threshold pill (Bangladesh
 * only), "x° above normal" and the detail chips. Data: useConditions (+ own zone for "Roof & road").
 */
import { useTranslations } from 'next-intl';

import { SourceChips, Skeleton } from '@/components/cz/states';
import { B, HEAT_RISK, R } from '@/components/cz/tokens';
import { AccountMenuButton } from '@/components/cz/shell/account-menu';
import { GlassPill, I, Icon, IconBtn, Photo, Tap, Txt, View } from '@/components/cz/ui';
import { useTServer } from '@/i18n/server-text';
import type { Conditions } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { CREDIT, PHOTO } from './photos';

/** "2026-10-05T14:45" (local time at the place) → "14:45" without a timezone shift. */
export function placeTime(iso: string): string {
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

export function Hero({
  cond,
  loading,
  place,
  name,
  lstC,
  unread,
}: {
  cond: Conditions | undefined;
  loading: boolean;
  place: string;
  name: string | null;
  lstC: number | null;
  unread: boolean;
}) {
  const { f } = useCz();
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const ts = useTServer();
  const hour = new Date().getHours();
  const g = hour < 12 ? 'am' : hour < 17 ? 'pm' : 'eve';
  const greet = name ? t(`greet.${g}Name`, { name }) : t(`greet.${g}`);
  const risk = cond ? HEAT_RISK[cond.heat_risk] : null;

  type Chip = { k: string; label: string; val: string; icon: string };
  const chips: Chip[] = cond
    ? ([
        lstC != null ? { k: 'lst', label: t('lst'), val: f.deg(lstC), icon: I.lst } : null,
        { k: 'hum', label: t('hum'), val: f.pct(cond.humidity), icon: I.drop },
        { k: 'wind', label: t('wind'), val: `${f.loc(Math.round(cond.wind_kmh))} km/h`, icon: I.wind },
        { k: 'upd', label: t('upd'), val: f.loc(placeTime(cond.time)), icon: I.clock },
      ] as (Chip | null)[]).filter((x): x is Chip => !!x)
    : [];

  const anomaly =
    cond?.anomaly_c == null
      ? null
      : Math.abs(cond.anomaly_c) < 0.5
        ? t('nearNormal')
        : cond.anomaly_c > 0
          ? t('aboveNormal', { d: f.dAbs(cond.anomaly_c, 1) })
          : t('belowNormal', { d: f.dAbs(cond.anomaly_c, 1) });

  return (
    <Photo
      src={PHOTO.neighborhood()}
      label={CREDIT.neighborhood}
      priority
      style={{ minHeight: 500 }}
      scrim={[
        [0, 0.55],
        [0.32, 0.1],
        [0.58, 0.35],
        [1, 0.86],
      ]}>
      <View style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingHorizontal: 20, paddingBottom: 52, minHeight: 500, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Tap label={`${t('changeLoc')}: ${place}`} href={href('S03')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flexShrink: 1, minWidth: 0 }}>
            <Icon d={I.pin} size={18} color={B.white} />
            <Txt size={14} w={500} color={B.white} lines={1} style={{ flexShrink: 1 }}>
              {place}
            </Txt>
          </Tap>
          <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
            <IconBtn d={I.bell} label={t('alerts')} tone="glass" iconSize={20} badge={unread} href={href('S21')} />
            <AccountMenuButton tone="glass" />
          </View>
        </View>

        {/* Warnings come first (BMD-threshold heat wave / dangerous heat) */}
        {cond?.warnings.map((w, i) => (
          <View
            key={i}
            role="alert"
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 16, backgroundColor: w.level === 'danger' || w.level === 'severe' || w.level === 'very_severe' ? 'rgba(163,36,43,0.88)' : 'rgba(194,106,16,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
            <Icon d={I.warn} size={18} color={B.white} sw={2} />
            <Txt size={12.5} color={B.white} style={{ flex: 1, lineHeight: 18 }}>
              {ts(w.text)}
            </Txt>
          </View>
        ))}

        <View style={{ flex: 1 }} />

        {/* Urdu (Nastaliq) digits descend below the line box; the margin keeps them off the pills. */}
        <View style={{ gap: 10 }}>
          <Txt size={15} color="rgba(255,255,255,0.9)">
            {greet}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            {cond ? (
              <Txt size={92} num color={B.white} as="h1" style={{ lineHeight: 96, letterSpacing: -2.8, ...(f.lang === 'ur' ? { marginBottom: 16 } : null) }}>
                {f.deg(cond.air_c)}
              </Txt>
            ) : (
              <View style={{ height: 96, justifyContent: 'flex-end' }}>
                {loading ? <Skeleton w={150} h={80} r={20} style={{ opacity: 0.35 }} /> : <Txt size={92} color={B.white}>–</Txt>}
              </View>
            )}
            <View style={{ alignItems: 'flex-end', gap: 4, paddingBottom: 8, flexShrink: 1, minWidth: 0 }}>
              <Txt size={12.5} color="rgba(255,255,255,0.85)">
                {t('airTemp')}
              </Txt>
              {cond ? (
                <Txt size={15} w={600} color={B.white} num lines={1}>
                  {t('feels')} {f.deg(cond.feels_c)}
                </Txt>
              ) : null}
              {risk && cond ? (
                <View style={{ backgroundColor: risk.color, paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill }}>
                  <Txt size={10.5} w={700} color={risk.fg} style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {tc(`risk.${cond.heat_risk}`)}
                  </Txt>
                </View>
              ) : null}
            </View>
          </View>
          {cond && (cond.bmd_level || anomaly) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {cond.bmd_level ? (
                <GlassPill style={{ height: 30, gap: 6, backgroundColor: 'rgba(229,83,61,0.85)', borderColor: 'rgba(255,255,255,0.35)' }}>
                  <Icon d={I.sun} size={14} color={B.white} />
                  <Txt size={12} w={600} color={B.white}>
                    {t('bmd', { level: ts({ code: `bmd.${cond.bmd_level}` }) })}
                  </Txt>
                </GlassPill>
              ) : null}
              {anomaly ? (
                <GlassPill style={{ height: 30, gap: 6 }}>
                  <Icon d={I.trend} size={14} color={B.white} />
                  <Txt size={12} w={600} color={B.white} num>
                    {anomaly}
                  </Txt>
                </GlassPill>
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {chips.map((ch) => (
              <GlassPill key={ch.k} style={{ height: 32, gap: 6 }}>
                <Icon d={ch.icon} size={14} color={B.white} />
                <Txt size={12} color={B.white} num>
                  {ch.label}{' '}
                  <Txt size={12} w={600} color={B.white} num>
                    {ch.val}
                  </Txt>
                </Txt>
              </GlassPill>
            ))}
          </View>
          {cond ? <SourceChips meta={cond.meta} tone="glass" /> : null}
        </View>
      </View>
    </Photo>
  );
}
