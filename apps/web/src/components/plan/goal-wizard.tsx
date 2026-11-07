'use client';

/**
 * S08 · Cooling goal wizard (prompt-v1 §6.6): zone, existing goal, space inventory, target +
 * timeline → POST /goals. The recommended target comes from the server's plan preview: the zone's
 * clipped planting space and the timeline (trees ramp to full effect by year 8). Under 3 years the
 * goal is an action goal. Guests keep a draft and sign up; the draft survives the sign-up (G5).
 */
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  B,
  Card,
  CzButton,
  Divider,
  ErrorState,
  GhostButton,
  HeatBadge,
  I,
  Icon,
  Label,
  ListRow,
  R,
  Screen,
  ScreenHeader,
  Seg,
  SkeletonCard,
  SkeletonText,
  SourceChips,
  Spinner,
  Tap,
  Txt,
  View,
  go,
  goReplace,
  href,
  requireAccount,
  useCz,
  useLocation,
} from '@/components/cz';
import { DEMO_POINT, GUEST_MAX_RADIUS_M, clearGoalDraft, isGuestRestricted, readGoalDraft, saveGoalDraft, useCreateGoal, useGoals, usePlanPreview, usePlantingSpots, useSession, useZone, useZones } from '@/lib/data/hooks';
import type { LatLng } from '@/lib/data/types';

import { TARGETS, TIMELINES, addMonths, zoneArea } from './use-goal-plan';

export function distM(a: LatLng, b: LatLng): number {
  const R0 = 6371000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R0 * Math.asin(Math.sqrt(h));
}

/** The S06 driver the user tapped "Add to goal" on (`?focus=`). */
export type GoalFocus = 'sealed' | 'green' | 'roofs' | 'density';

export function GoalWizard({ zoneId, focus = null }: { zoneId: string | null; focus?: GoalFocus | null }) {
  if (!zoneId) return <ZonePicker />;
  return <Wizard zoneId={zoneId} focus={focus} key={zoneId} />;
}

/** "Starting with: Green cover · Plant street trees along the main roads" (from S06 drivers). */
function FocusCard({ focus }: { focus: GoalFocus }) {
  const t = useTranslations('plan');
  const td = useTranslations('zone.drivers');
  const { c } = useCz();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, backgroundColor: c.limeSoft }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={I.trend} size={17} sw={2.2} color={B.limeInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={11.5} dim>
          {t('focusLabel')} · {td(focus)}
        </Txt>
        <Txt size={13.5} w={600}>
          {td(`fix.${focus}`)}
        </Txt>
      </View>
    </View>
  );
}

function ZonePicker() {
  const t = useTranslations('plan');
  const { f, prefs } = useCz();
  const session = useSession();
  const { focus } = useLocation();
  const point = session.presentation ? DEMO_POINT : focus;
  const radius = session.isGuest ? Math.min(prefs.radius_m, GUEST_MAX_RADIUS_M) : prefs.radius_m;
  const zones = useZones(point, radius);
  const list = zones.data?.zones.slice(0, 6) ?? [];
  // E7: show progress on the tapped row while its zone page loads.
  const [opening, setOpening] = useState<string | null>(null);
  return (
    <Screen>
      <ScreenHeader title={t('goalTitle')} sub={t('goalSub')} />
      <Card gap={4}>
        <Txt display size={14} as="h2">
          {t('pickZone')}
        </Txt>
        <Txt size={12} dim style={{ paddingBottom: 6 }}>
          {t('pickZoneSub')}
        </Txt>
        {zones.isLoading ? (
          <SkeletonText lines={4} />
        ) : zones.isError ? (
          <ErrorState compact error={zones.error} onRetry={() => void zones.refetch()} />
        ) : list.length ? (
          list.map((z, i) => (
            <ListRow
              key={z.id}
              last={i === list.length - 1}
              label={z.name}
              onPress={() => {
                setOpening(z.id);
                goReplace('S08', { zone: z.id });
              }}>
              <HeatBadge score={z.score} size={38} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={14} w={600} lines={1}>
                  {z.name}
                </Txt>
                <Txt size={12} dim>
                  {f.dist(z.dist_m)}
                </Txt>
              </View>
              {opening === z.id ? <Spinner size={16} /> : <Icon d={f.fwdPath} size={16} sw={2} />}
            </ListRow>
          ))
        ) : (
          <Txt size={13} dim>
            {t('noZones')}
          </Txt>
        )}
      </Card>
      {zones.data ? <SourceChips meta={zones.data.meta} /> : null}
      <GhostButton label={t('openMap')} href={href('S05')} />
    </Screen>
  );
}

function Wizard({ zoneId, focus: driver }: { zoneId: string; focus: GoalFocus | null }) {
  const t = useTranslations('plan');
  const { c, f } = useCz();
  const session = useSession();
  const zone = useZone(zoneId);
  const spots = usePlantingSpots(zoneId);
  const goals = useGoals();
  const create = useCreateGoal();
  // A draft kept from before sign-up restores the choices (G5).
  const draft = useMemo(() => {
    const d = typeof window !== 'undefined' ? readGoalDraft() : null;
    return d && d.zone_id === zoneId ? d : null;
  }, [zoneId]);
  const [tl, setTl] = useState(() => {
    if (!draft) return 1;
    const months = (Date.parse(draft.by_date) - Date.now()) / (30.44 * 864e5);
    let best = 0;
    TIMELINES.forEach((x, i) => {
      if (Math.abs(x.months - months) < Math.abs(TIMELINES[best].months - months)) best = i;
    });
    return best;
  });
  const [pick, setPick] = useState<number | null>(() => {
    const i = draft ? TARGETS.indexOf(draft.target_c as (typeof TARGETS)[number]) : -1;
    return i >= 0 ? i : null;
  });

  const existing = goals.data?.find((g) => g.zone_id === zoneId) ?? null;
  const rawArea = zoneArea(zone.data?.h3, 0);

  const months = TIMELINES[tl].months;
  const byDate = useMemo(() => addMonths(new Date(), months), [months]);
  const byIso = byDate.toISOString().slice(0, 10);
  // The server's recommendation for this space and date (§7.10): largest target ≤ 85 % achievable.
  const preview = usePlanPreview(zone.data ? zoneId : null, TARGETS[pick ?? 1], byIso);
  const rec = preview.data?.feasibility.recommended_target_c ?? null;
  const achievable = preview.data?.feasibility.achievable_c ?? null;
  const recIdx = useMemo(() => {
    if (rec == null) return 0;
    let idx = -1;
    TARGETS.forEach((v, i) => {
      if (Math.abs(v) <= Math.abs(rec) + 1e-9) idx = i;
    });
    return Math.max(0, idx);
  }, [rec]);
  const tgt = pick ?? recIdx;
  // G3: under 3 years a goal is stated in actions, with the long-term °C alongside.
  const actionGoal = months < 36;

  const submit = () => {
    if (!zone.data) return;
    const d = { zone_id: zone.data.id, target_c: TARGETS[tgt], by_date: byIso };
    if (session.isGuest) {
      void saveGoalDraft(d);
      return requireAccount(t('createFeature'));
    }
    create.mutate(
      { zone: { id: zone.data.id }, target_c: d.target_c, by_date: d.by_date },
      {
        onSuccess: (g) => {
          clearGoalDraft();
          go('S09', { id: g.id });
        },
      },
    );
  };


  if (zone.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('goalTitle')} sub={t('goalSub')} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (zone.isError || !zone.data) {
    return (
      <Screen>
        <ScreenHeader title={t('goalTitle')} sub={t('goalSub')} />
        <ErrorState error={zone.error} onRetry={() => void zone.refetch()} />
        <GhostButton label={t('pickZone')} onPress={() => goReplace('S08')} />
      </Screen>
    );
  }

  const z = zone.data;
  // The zone's stored distance from its scan centre (§7.3), never recomputed here (E10).
  const dist = z.dist_m;
  const totals = spots.data?.totals;
  const inv: [string, string][] = totals
    ? [
        [t('roofs'), f.area2(totals.roof_m2)],
        [t('ground'), f.area2(totals.ground_m2)],
        [t('edge'), f.dist(totals.roadside_m)],
        [t('spotsCount'), f.num(spots.data?.features.length ?? 0)],
      ]
    : [];

  return (
    <Screen>
      <ScreenHeader title={t('goalTitle')} sub={t('goalSub')} />

      <Card pad={10} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 60, height: 60, borderRadius: R.md, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.target} size={26} color={B.lime} sw={1.8} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Label>{t('zoneSet')}</Label>
          <Txt size={15} w={600} lines={1}>
            {z.name}
          </Txt>
          <Txt size={12} dim>
            {dist != null && dist < 50000 ? t('zoneMeta', { score: f.loc(z.score), dist: f.dist(dist) }) : t('zoneMetaNoDist', { score: f.loc(z.score), area: f.area2(Math.round(rawArea * 1e6)) })}
          </Txt>
        </View>
        <HeatBadge score={z.score} size={42} />
      </Card>
      <Tap role="link" label={t('changeZone')} onPress={() => goReplace('S08')} style={{ alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', marginTop: -6, paddingHorizontal: 4 }}>
        <Txt size={12.5} w={600} color={c.leaf}>
          {t('changeZone')}
        </Txt>
      </Tap>

      {driver ? <FocusCard focus={driver} /> : null}

      {existing ? (
        <Card>
          <Label>{t('existing')}</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={I.target} size={20} sw={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={14} w={600} lines={1}>
                {existing.zone_name}
              </Txt>
              <Txt size={12} dim>
                {t('existingGoal', { target: f.dC(existing.target_c), date: f.date(existing.by_date, { month: 'short', year: 'numeric' }) })}
              </Txt>
            </View>
            <GhostButton label={t('openPlan')} height={40} href={href('S10')} />
          </View>
          <Txt size={12} dim>
            {t('existingNote')}
          </Txt>
        </Card>
      ) : null}

      <Card>
        <Label>{t('space')}</Label>
        {spots.isLoading ? (
          <SkeletonText lines={2} />
        ) : spots.isError ? (
          <ErrorState compact error={spots.error} onRetry={() => void spots.refetch()} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {inv.map(([label, val]) => (
                <View key={label} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 0, backgroundColor: c.soft, borderRadius: R.md, padding: 12, gap: 2 }}>
                  <Txt size={11.5} dim lines={1}>
                    {label}
                  </Txt>
                  <Txt size={20} num lines={1} style={{ letterSpacing: -0.2 }}>
                    {val}
                  </Txt>
                </View>
              ))}
            </View>
            <Txt size={11} dim>
              {t('spaceSrc')}
            </Txt>
            {spots.data ? <SourceChips meta={spots.data.meta} /> : null}
          </>
        )}
      </Card>

      <Card>
        <Label>{t('target')}</Label>
        <View role="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
          {TARGETS.map((v, i) => {
            const on = tgt === i;
            const rec = i === recIdx;
            return (
              <Tap
                key={v}
                role="radio"
                selected={on}
                haptic
                label={f.dC(v) + (rec ? `, ${t('rec')}` : '')}
                onPress={() => setPick(i)}
                style={{ flex: 1, minWidth: 0, height: 56, borderRadius: R.md, backgroundColor: on ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 }}>
                <Txt size={14} w={600} num lines={1} color={on ? B.limeInk : c.ink}>
                  {f.dC(v)}
                </Txt>
                {rec ? (
                  <Txt size={9.5} w={600} lines={1} color={on ? B.limeInk : c.ink} style={{ letterSpacing: 0.3, textTransform: 'uppercase' }}>
                    {t('rec')}
                  </Txt>
                ) : null}
              </Tap>
            );
          })}
        </View>
        <Txt size={12} dim>
          {preview.isLoading
            ? t('recLoading')
            : rec == null
              ? preview.data?.feasibility.spots_status === 'pending'
                ? t('recNoteUnknown')
                : t('recNone', { max: f.dC(-(achievable ?? 0)) })
              : t('recNoteDate', { target: f.dC(TARGETS[recIdx]), max: f.dC(-(achievable ?? 0)), date: f.date(byDate, { month: 'short', year: 'numeric' }) })}
        </Txt>
        <Divider />
        <Label>{t('timeline')}</Label>
        <Seg label={t('timeline')} options={TIMELINES.map((x, i) => ({ label: t(`tls.${x.key}`), value: i }))} value={tl} onChange={setTl} height={40} />
        {actionGoal ? (
          <View style={{ backgroundColor: c.limeSoft, borderRadius: R.md, padding: 12 }}>
            <Txt size={12.5}>{t('actionNote')}</Txt>
          </View>
        ) : null}
        <Txt size={12} dim>
          {t('goalDate') + ' · '}
          <Txt as="span" size={12} w={600}>
            {f.date(byDate)}
          </Txt>
        </Txt>
      </Card>

      {create.isError && !isGuestRestricted(create.error) ? <ErrorState compact error={create.error} /> : null}
      <CzButton label={create.isPending ? t('creating') : t('checkFeas')} icon="arrow" busy={create.isPending} disabled={create.isPending} onPress={submit} />
    </Screen>
  );
}
