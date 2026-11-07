'use client';
/**
 * P2 · My goals (prompt-v1 §6.3, §6.6 G4): each goal's progress, target, date and next task, from
 * the server. Action goals (under 3 years) show the planting and roof targets; cooling goals the °C.
 */
import { useTranslations } from 'next-intl';

import { requireAccount } from '@/components/cz/account';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/cz/states';
import { B } from '@/components/cz/tokens';
import { Bar, Card, CzButton, I, Label, Screen, ScreenHeader, Tag, Tap, Txt, View } from '@/components/cz/ui';
import { useGoals, useGoalTasks, useSession } from '@/lib/data/hooks';
import type { Goal } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';
import { useServerText } from '@/lib/server-text';

function GoalCard({ g }: { g: Goal }) {
  const t = useTranslations('plan.goals');
  const { c, f } = useCz();
  const tx = useServerText();
  const tasks = useGoalTasks(g.id);
  const next = tasks.data?.find((x) => x.status !== 'done') ?? null;
  const action = g.kind === 'action';
  return (
    <Card gap={10}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt size={15} w={600} lines={1} style={{ flex: 1, minWidth: 0 }}>
          {g.zone_name}
        </Txt>
        <Tag size="xs" label={action ? t('kindAction') : t('kindCooling')} fg={c.ink2} />
        {g.team_id ? <Tag size="xs" label={t('team')} fg={c.ink2} /> : null}
      </View>
      <Txt size={12.5} dim num>
        {action
          ? t('actionTarget', { trees: f.num(g.targets?.trees ?? 0), roof: f.area2(g.targets?.roof_m2 ?? 0), date: f.date(g.by_date, { month: 'short', year: 'numeric' }), c: f.dC(-(g.targets?.long_term_c ?? Math.abs(g.target_c))) })
          : t('coolingTarget', { target: f.dC(g.target_c), date: f.date(g.by_date, { month: 'short', year: 'numeric' }) })}
      </Txt>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Label>{t('progress')}</Label>
          <Txt size={12} w={600} num>
            {f.pct(g.progress_pct)}
          </Txt>
        </View>
        <Bar pct={g.progress_pct} color={B.green} />
        <Txt size={11.5} dim num>
          {t('done', { trees: f.num(g.done?.trees ?? 0), roof: f.area2(g.done?.roof_m2 ?? 0), c: f.dC(-g.modeled_c, 2) })}
        </Txt>
      </View>
      {next ? (
        <View style={{ padding: 10, borderRadius: 14, backgroundColor: c.soft, gap: 2 }}>
          <Txt size={11} dim>
            {t('next')}
            {next.due ? ` · ${f.date(next.due, { day: 'numeric', month: 'short' })}` : ''}
          </Txt>
          <Txt size={13} w={600}>
            {tx(next.title)}
          </Txt>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tap label={t('openPlan')} href={href('S10', undefined, { goal: g.id })} style={{ flex: 1, minHeight: 44, borderRadius: 999, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={13} w={600} color={B.limeInk}>
            {t('openPlan')}
          </Txt>
        </Tap>
        <Tap label={t('logAction')} href={href('S14', undefined, { goal: g.id })} style={{ flex: 1, minHeight: 44, borderRadius: 999, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={13} w={600}>
            {t('logAction')}
          </Txt>
        </Tap>
      </View>
    </Card>
  );
}

export function MyGoals() {
  const t = useTranslations('plan.goals');
  const session = useSession();
  const goals = useGoals();
  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub')} />
      {session.ready && session.isGuest ? (
        <EmptyState icon={I.target} title={t('guestTitle')} sub={t('guestSub')} action={t('create')} onAction={() => requireAccount(t('feature'))} />
      ) : goals.isLoading || !session.ready ? (
        <View aria-busy style={{ gap: 12 }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : goals.isError ? (
        <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
      ) : goals.data?.length ? (
        goals.data.map((g) => <GoalCard key={g.id} g={g} />)
      ) : (
        <EmptyState icon={I.target} title={t('emptyTitle')} sub={t('emptySub')} action={t('new')} actionHref={href('S08')} />
      )}
      {goals.data?.length ? <CzButton label={t('new')} icon="plus" href={href('S08')} /> : null}
    </Screen>
  );
}
