'use client';
/**
 * S04 · Home sections below the hero (port of screens/home/sections.tsx): 5-day forecast strip,
 * air-quality teaser, trees due a photo, hottest-zones carousel and the goal + next task.
 */
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { requireAccount } from '@/components/cz/account';
import { HScroll, SkeletonCard, SourceChips } from '@/components/cz';
import { AQI_COLORS, AQI_FG, AQI_CATEGORIES, B, HEAT_RISK, R, SHADOW, heatColor, heatFg } from '@/components/cz/tokens';
import { Card, CzButton, Divider, GhostButton, I, Icon, Label, Photo, Ring, SectionTitle, Tap, Txt, View } from '@/components/cz/ui';
import { cellsToSvg } from '@/components/map/geo';
import { useTServer } from '@/i18n/server-text';
import { daysUntilDue, needsPhoto, usePlan, useTeam } from '@/lib/data/hooks';
import type { Air, Conditions, Goal, HexCell, Tree, ZoneSummary } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { placeTime } from './hero';
import { PHOTO } from './photos';
import { useServerText } from '@/lib/server-text';

const mx = { marginHorizontal: 16 };

/* ───────────────────────── 5-day forecast ───────────────────────── */

export function ForecastCard({ cond }: { cond: Conditions }) {
  const { c, f } = useCz();
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const ts = useTServer();
  const days = cond.forecast.slice(0, 5);
  if (!days.length) return null;
  const today = cond.time.slice(0, 10);
  return (
    <Card style={mx} gap={12}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Txt display size={14} as="h2">
          {t('forecast')}
        </Txt>
        <Txt size={11} dim>
          {cond.place}
        </Txt>
      </View>
      <View role="list" style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((d) => {
          const risk = HEAT_RISK[d.heat_risk];
          const day = d.date === today ? t('today') : f.weekday(d.date + 'T12:00:00');
          return (
            <View
              key={d.date}
              role="listitem"
              label={t('forecastA11y', { day, max: f.deg(d.tmax_c), min: d.tmin_c != null ? f.deg(d.tmin_c) : '—', feels: f.deg(d.feels_max_c), risk: tc(`risk.${d.heat_risk}`) })}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 16, backgroundColor: c.soft }}>
              <Txt size={11.5} w={600} lines={1}>
                {day}
              </Txt>
              <span aria-hidden style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: risk.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={I.sun} size={13} color={risk.fg} sw={2} />
              </span>
              <Txt size={15} w={600} num>
                {f.deg(d.tmax_c)}
              </Txt>
              <Txt size={11} dim num>
                {d.tmin_c != null ? f.deg(d.tmin_c) : '—'}
              </Txt>
              {d.bmd_level ? (
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: B.red }} title={ts({ code: `bmd.${d.bmd_level}` })} />
              ) : null}
            </View>
          );
        })}
      </View>
      {days.some((d) => d.bmd_level) ? (
        <Txt size={11} dim>
          {ts({ code: 'bmd.disclaimer' })}
        </Txt>
      ) : null}
    </Card>
  );
}

/* ───────────────────────── Air quality teaser ───────────────────────── */

export function AirCard({ air }: { air: Air }) {
  const { c, f } = useCz();
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const ts = useTServer();
  const band = Math.max(0, AQI_CATEGORIES.indexOf(air.category));
  const bg = AQI_COLORS[band];
  const fg = AQI_FG[band];
  const cat = tc(`aqi.${air.category}`);
  const asOf = air.meta.sources.find((s) => s.as_of)?.as_of;
  return (
    <Card href={href('S26')} label={`${t('airq.title')}: PM2.5 ${f.dec(air.pm25, 0)}, ${cat}`} pad={14} style={[mx, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={22} w={600} color={fg} num style={{ lineHeight: 24 }}>
          {f.loc(Math.round(air.pm25))}
        </Txt>
        <Txt size={9.5} w={600} color={fg} style={{ lineHeight: 12 }}>
          PM2.5
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Txt size={13.5} w={600}>
            {t('airq.title')}
          </Txt>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.pill, backgroundColor: bg }}>
            <Txt size={10.5} w={700} color={fg}>
              {cat}
            </Txt>
          </View>
        </View>
        {air.advice[0] ? (
          <Txt size={12} dim style={{ lineHeight: 17 }}>
            {ts(air.advice[0])}
          </Txt>
        ) : null}
        <Txt size={10.5} dim>
          {t('airq.src', { time: asOf ? f.loc(placeTime(asOf)) : '' })} · AQI {f.loc(air.aqi)}
        </Txt>
      </View>
      <Icon d={f.fwdPath} size={16} color={c.ink} sw={2} />
    </Card>
  );
}

/* ───────────────────────── Trees that need a photo ───────────────────────── */

export function DueTreesCard({ trees }: { trees: Tree[] }) {
  const { c, f } = useCz();
  const t = useTranslations('home.due');
  const due = trees
    .filter(needsPhoto)
    .map((tree) => ({ tree, days: daysUntilDue(tree.next_due_at) }))
    .sort((a, b) => a.days - b.days);
  if (!due.length) return null;
  return (
    <View style={[mx, { borderRadius: R.xl, padding: 14, gap: 12, borderWidth: 2, borderColor: B.orange, backgroundColor: c.card }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(242,154,56,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.camera} size={20} color={B.orangeInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt size={15} w={600} as="h2">
            {t('title', { count: due.length, n: f.loc(due.length) })}
          </Txt>
          {due.slice(0, 3).map(({ tree, days }) => {
            const over = days < 0;
            const col = over ? B.deepRed : B.orange;
            const when = over ? t('od', { n: f.loc(-days) }) : days <= 0 ? t('today') : t('soon', { n: f.loc(days) });
            const line = `${tree.nickname} · ${when}`;
            return (
              <Tap key={tree.id} label={line} href={href('tree', { id: tree.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 14, minHeight: 48 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: col, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={12} w={700} color={over ? B.white : B.navy}>
                    {Array.from(tree.nickname || '?')[0]}
                  </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Txt size={13} w={600}>
                    {line}
                  </Txt>
                  <View style={{ height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: c.soft }}>
                    <View style={{ height: '100%', borderRadius: 3, backgroundColor: col, width: `${Math.min(100, Math.max(20, 40 + -days * 15))}%` }} />
                  </View>
                </View>
                <Icon d={f.fwdPath} size={16} sw={2} />
              </Tap>
            );
          })}
          <Txt size={11.5} dim>
            {t('rule')}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <CzButton label={t('submit')} icon="camera" size="md" href={href('tree', { id: due[0].tree.id })} style={{ flex: 1 }} />
        <GhostButton label={t('mine')} height={46} href={href('S20')} />
      </View>
    </View>
  );
}

/** Soft CTA for guests (they can't track trees). */
export function GuestTreesCard() {
  const { c } = useCz();
  const t = useTranslations('home.due');
  const th = useTranslations('home');
  return (
    <Card style={[mx, { flexDirection: 'row', alignItems: 'center', gap: 12 }]} pad={14}>
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={I.tree} size={20} color={c.leaf} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14} w={600}>
          {t('guestTitle')}
        </Txt>
        <Txt size={12} dim>
          {t('guestBody')}
        </Txt>
      </View>
      <GhostButton label={t('guestCta')} height={40} onPress={() => requireAccount(th('treesFeature'))} style={{ paddingHorizontal: 12 }} />
    </Card>
  );
}

/* ───────────────────────── Hottest zones carousel ───────────────────────── */

function ZoneThumb({ zone, hexes }: { zone: ZoneSummary; hexes: Map<string, HexCell> }) {
  const polys = useMemo(() => cellsToSvg(zone.h3.map((h) => ({ h3: h, score: hexes.get(h)?.score ?? zone.score })), 100, 12), [zone, hexes]);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" aria-hidden style={{ position: 'absolute', inset: 0 }}>
      {polys.map((p, i) => (
        <polygon key={i} points={p.pts} fill={heatColor(p.score ?? 0)} fillOpacity={0.85} stroke="rgba(255,255,255,0.85)" strokeWidth={1} />
      ))}
    </svg>
  );
}

export function HottestZones({ zones, hexes }: { zones: ZoneSummary[]; hexes: HexCell[] }) {
  const { c, f } = useCz();
  const t = useTranslations('home');
  const tm = useTranslations('map');
  const byH3 = useMemo(() => new Map(hexes.map((h) => [h.h3, h])), [hexes]);
  if (!zones.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t('hottest')} action={t('seeMap')} actionHref={href('S05')} style={{ paddingHorizontal: 20 }} />
      <HScroll gap={10} padded={false} style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
        {zones.slice(0, 6).map((z) => {
          const meta = `${z.lst_c != null ? `${tm('lstShort')} ${f.deg(z.lst_c)} · ` : ''}${f.dist(z.dist_m)}`;
          return (
            <Tap
              key={z.id}
              href={href('S06', { id: z.id })}
              label={`${z.name}, ${tm('scoreA11y', { score: f.loc(z.score) })}, ${meta}`}
              style={{ width: 172, borderRadius: R.xl, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 12, gap: 10, backgroundColor: c.card, textAlign: 'start' }}>
              <View style={{ height: 110, borderRadius: 18, overflow: 'hidden', background: `radial-gradient(circle at 50% 40%, ${B.photoBg2}, ${B.navy})` }}>
                <ZoneThumb zone={z} hexes={byH3} />
                <View style={{ position: 'absolute', top: 8, start: 8, height: 26, paddingHorizontal: 9, borderRadius: R.pill, justifyContent: 'center', backgroundColor: heatColor(z.score) }}>
                  <Txt size={11.5} w={700} color={heatFg(z.score)} num>
                    {f.loc(z.score)}
                  </Txt>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={13} w={600} lines={1}>
                    {z.name}
                  </Txt>
                  <Txt size={11.5} dim num lines={1}>
                    {meta}
                  </Txt>
                </View>
                <View style={[{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }, SHADOW.button]}>
                  <Icon d={f.arrowPath} size={16} color={B.limeInk} sw={2} />
                </View>
              </View>
            </Tap>
          );
        })}
      </HScroll>
    </View>
  );
}

/* ───────────────────────── Goal + next task ───────────────────────── */

export function GoalCard({ goal }: { goal: Goal }) {
  const { f } = useCz();
  const t = useTranslations('home');
  const team = useTeam(goal.team_id);
  const plan = usePlan(goal);
  const goalLine = t('goalLine', { d: f.dC(goal.target_c), date: f.date(goal.by_date) });
  const who = team.data?.name ?? goal.zone_name;
  const tx = useServerText();
  const task = plan.data?.next_task;
  return (
    <Card style={mx} gap={14}>
      <Tap label={`${t('goal')}: ${goalLine}`} href={href('S10')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, textAlign: 'start' }}>
        <Ring pct={goal.progress_pct} size={72} stroke={9}>
          <Txt size={16} w={600} num>
            {f.pct(goal.progress_pct)}
          </Txt>
        </Ring>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Label>{t('goal')}</Label>
          <Txt size={16} w={600}>
            {goalLine}
          </Txt>
          <Txt size={12} dim>
            {t('goalSub', { who, d: f.dC(-Math.abs(goal.modeled_c), 2) })}
          </Txt>
        </View>
      </Tap>
      {task || plan.isLoading ? (
        <>
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Photo src={PHOTO.neighborhood(200, 200)} style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: B.photoBg2 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Label>{t('next')}</Label>
              {task ? (
                <Txt size={14} w={600}>
                  {tx(task.text)}
                </Txt>
              ) : (
                <View style={{ gap: 6, paddingTop: 4 }}>
                  <span className="cz-skeleton" style={{ height: 12, borderRadius: 6, width: '80%' }} />
                </View>
              )}
            </View>
            <CzButton label={t('logAction')} icon="camera" size="sm" href={href('S14', undefined, task ? { type: task.action_type, goal: goal.id } : { goal: goal.id })} />
          </View>
          {plan.data ? <SourceChips meta={plan.data.meta} /> : null}
        </>
      ) : null}
    </Card>
  );
}

export function GoalCta({ zone, guest }: { zone: ZoneSummary | null; guest: boolean }) {
  const { c } = useCz();
  const t = useTranslations('home');
  return (
    <Card style={mx} gap={12}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.target} size={20} color={c.leaf} sw={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={15} w={600} as="h2">
            {t('goalCta.title')}
          </Txt>
          <Txt size={12} dim>
            {zone ? t('goalCta.body', { zone: zone.name }) : t('goalCta.bodyNoZone')}
          </Txt>
        </View>
      </View>
      {guest ? (
        <CzButton label={t('goalCta.cta')} icon="plus" size="md" onPress={() => requireAccount(t('goalFeature'))} />
      ) : (
        <CzButton label={t('goalCta.cta')} icon="plus" size="md" href={href('S08', undefined, zone ? { zone: zone.id } : undefined)} />
      )}
    </Card>
  );
}

export function SectionSkeleton() {
  return <SkeletonCard lines={2} style={mx} />;
}
