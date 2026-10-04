'use client';

/** S09 · Feasibility: verdict (usePlan(goal).feasibility), space needed, planting map, who can do it, milestones. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { B, Bar, Card, CzButton, ErrorState, GhostButton, Label, R, Screen, ScreenHeader, SkeletonCard, SourceChips, Txt, View, href, useCz } from '@/components/cz';
import { usePlantingSpots } from '@/lib/data/hooks';
import type { Goal, Plan } from '@/lib/data/types';
import { useTServer } from '@/i18n/server-text';

import { PlantingMap } from './planting-map';
import { monthsUntil, useGoalPlan } from './use-goal-plan';
import { iso } from './bidi';

/** Rough hours of work: planting a tree ≈ 1.5 h, coating 15 m² ≈ 1 h, one shade structure ≈ 8 h. */
export function workHours(n: { trees: number; roof_m2: number; shade: number }) {
  return n.trees * 1.5 + n.roof_m2 / 15 + n.shade * 8;
}

export function Feasibility({ id }: { id: string }) {
  const t = useTranslations('plan');
  const { f } = useCz();
  const { goal, goals, plan, binding, bindError, retryBind } = useGoalPlan(id);
  const sub = goal ? `${goal.zone_name} · ${iso(f.dC(goal.target_c))} · ${f.date(goal.by_date)}` : undefined;
  const head = <ScreenHeader title={t('feasTitle')} sub={sub} />;

  if (goals.isLoading || binding || (goal && plan.isLoading)) {
    return (
      <Screen>
        {head}
        <SkeletonCard lines={3} height={180} />
        <SkeletonCard lines={2} height={280} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (!goal) {
    return (
      <Screen>
        {head}
        <ErrorState title={t('goalNotFound')} body=" " error={goals.error} onRetry={() => void goals.refetch()} />
        <GhostButton label={t('noGoalCta')} href={href('S08')} />
      </Screen>
    );
  }
  if (bindError || plan.isError || !plan.data) {
    return (
      <Screen>
        {head}
        <ErrorState error={bindError ?? plan.error} onRetry={bindError ? retryBind : () => void plan.refetch()} />
      </Screen>
    );
  }
  return <Body goal={goal} plan={plan.data} head={head} />;
}

function Body({ goal, plan, head }: { goal: Goal; plan: Plan; head: React.ReactNode }) {
  const t = useTranslations('plan');
  const ts = useTServer();
  const { c, f, prefs } = useCz();
  const spots = usePlantingSpots(goal.zone_id);
  const fe = plan.feasibility;
  const months = monthsUntil(goal.by_date);
  const actionGoal = months < 6;

  // Space utilisation from the server's own notes (needed ÷ capacity).
  let used: number | null = null;
  for (const n of fe.notes) {
    const p = n.params ?? {};
    if (n.code === 'feas.trees_vs_space' && Number(p.capacity) > 0) used = Math.max(used ?? 0, Number(p.trees) / Number(p.capacity));
    if (n.code === 'feas.roofs_vs_space' && Number(p.capacity_m2) > 0) used = Math.max(used ?? 0, Number(p.roof_m2) / Number(p.capacity_m2));
  }
  const usedPct = used == null ? null : Math.round(used * 100);

  // Who can do it: total hours spread over the weeks left.
  const hours = workHours(fe.needed);
  const weeks = Math.max(1, Math.round(months * 4.35));
  const perWeek = hours / weeks;
  const verdict = (h: number): [string, string] => (h <= 3 ? [t('vC'), B.green] : h <= 6 ? [t('vD'), B.lime] : h <= 10 ? [t('vS'), B.orange] : [t('vN'), B.red]);
  const teamN = 5;
  const orgN = 20;
  const rows: [string, [string, string], string][] = [
    [t('solo'), verdict(perWeek), t('perWeekSolo', { h: f.loc(Math.max(1, Math.round(perWeek))) })],
    [t('team', { from: f.loc(teamN - 1), to: f.loc(teamN + 1) }), verdict(perWeek / teamN), t('perWeekEach', { h: f.loc(Math.max(1, Math.round(perWeek / teamN))) })],
    [t('org'), verdict(perWeek / orgN), t('perMonthTeam', { h: f.loc(Math.max(1, Math.round((perWeek * 4.35) / orgN))) })],
  ];

  // Milestones: the plan's steps spread from now to the goal date.
  const [now] = useState(() => Date.now());
  const end = Date.parse(goal.by_date) || now + 365 * 864e5;
  const steps = plan.steps.slice(0, 4);
  const ms: [string, string][] = steps.map((s, i) => [f.date(new Date(now + ((end - now) * (i + 0.5)) / (steps.length + 0.5)), { month: 'short', year: 'numeric' }), s.title]);
  ms.push([f.date(goal.by_date), t('goalDateMs')]);

  const needed: [string, string][] = [
    [t('neededTrees'), f.num(fe.needed.trees)],
    [t('neededRoof'), f.area2(fe.needed.roof_m2)],
    [t('neededShade'), f.num(fe.needed.shade)],
  ];

  return (
    <Screen>
      {head}

      <Card tone="navy" pad={20} gap={14} style={{ borderRadius: R.xxl }}>
        <Label color={B.lime}>{t('verdict')}</Label>
        <Txt display size={21} color={B.white} style={{ lineHeight: 27 }}>
          {actionGoal ? t('actionGoalHead') : t(`verdictHead.${fe.feasible}`)}
        </Txt>
        <Txt size={13} color="rgba(255,255,255,0.85)">
          {actionGoal ? t('actionNote') : t(`verdictSub.${fe.feasible}`)}
        </Txt>
        {usedPct != null ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={12} color="rgba(255,255,255,0.85)">
                {t('spaceUsed')}
              </Txt>
              <Txt size={12} w={600} num color={B.white}>
                {f.pct(usedPct, 0)}
              </Txt>
            </View>
            <Bar pct={Math.min(100, usedPct)} color={usedPct > 100 ? B.red : usedPct > 60 ? B.orange : B.lime} track="rgba(255,255,255,0.14)" label={t('spaceUsed')} />
          </View>
        ) : null}
      </Card>

      <Card pad={12}>
        <View style={{ gap: 3, paddingHorizontal: 4, paddingTop: 4 }}>
          <Txt display size={14} as="h2">
            {t('needed')}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {needed.map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, backgroundColor: c.soft, borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}>
              <Txt size={11} dim lines={1}>
                {label}
              </Txt>
              <Txt size={16} w={600} num lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>
        {spots.isError ? (
          <ErrorState compact error={spots.error} onRetry={() => void spots.refetch()} />
        ) : (
          <PlantingMap spots={spots.data} center={goal.zone_centroid} zoneName={goal.zone_name} height={280} />
        )}
        <View style={{ gap: 6, paddingHorizontal: 4 }}>
          {fe.notes.map((n, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.ink2, marginTop: 7 }} />
              <Txt size={12.5} style={{ flex: 1 }}>
                {ts(n)}
              </Txt>
            </View>
          ))}
        </View>
        {spots.data ? <SourceChips meta={spots.data.meta} style={{ paddingHorizontal: 4 }} /> : null}
      </Card>

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        <Txt label style={{ paddingTop: 10 }}>
          {t('whoCanDoIt')}
        </Txt>
        {rows.map(([who, [v, col], note], i) => (
          <View key={who} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: c.line }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: col }} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={14} w={600}>
                {who}
              </Txt>
              <Txt size={12} dim>
                {note}
              </Txt>
            </View>
            <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: c.soft }}>
              <Txt size={12} w={600} lines={1}>
                {v}
              </Txt>
            </View>
          </View>
        ))}
        <Txt size={11} dim style={{ paddingBottom: 10 }}>
          {t('effortNote', { hours: f.num(hours), weeks: f.num(weeks) })}
        </Txt>
      </Card>

      <Card gap={4}>
        <Label style={{ paddingBottom: 8 }}>{t('milestones')}</Label>
        {ms.map(([when, what], i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 14, alignItems: 'center' }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 3, backgroundColor: i === 0 ? B.lime : c.card, borderWidth: 2, borderColor: i === 0 ? B.lime : c.ink2 }} />
              <View style={{ flex: 1, width: 2, backgroundColor: c.line, opacity: i < ms.length - 1 ? 1 : 0 }} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2, paddingBottom: 14 }}>
              <Txt size={11} w={600} dim style={prefs.lang === 'en' ? { fontFamily: 'ui-monospace, Menlo, monospace' } : undefined}>
                {when}
              </Txt>
              <Txt size={13.5} w={i === 0 ? 600 : 400}>
                {what}
              </Txt>
            </View>
          </View>
        ))}
      </Card>

      <SourceChips meta={plan.meta} />

      <View style={{ gap: 10 }}>
        <CzButton label={t('seePlan')} icon="arrow" href={href('S10')} />
        <GhostButton label={t('startTeam')} href={href('S19', {}, { goal: goal.id })} />
      </View>
    </Screen>
  );
}
