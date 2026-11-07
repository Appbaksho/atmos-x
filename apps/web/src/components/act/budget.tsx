'use client';

/** S13 · Budget (usePlan(goal).budget): navy total, per member / per °C, line items, split. */
import { useTranslations } from 'next-intl';

import { AVATARS, Avatar, B, Card, CzButton, EmptyState, ErrorState, I, Icon, Label, R, Screen, ScreenHeader, SkeletonCard, SourceChips, Tag, Txt, View, href, useCz } from '@/components/cz';
import { useGoalPlan } from '@/components/plan/use-goal-plan';
import { useTeam } from '@/lib/data/hooks';
import type { Goal, Money, Plan } from '@/lib/data/types';
import { useTServer } from '@/i18n/server-text';
import { initials } from '@/lib/format';

export function BudgetScreen() {
  const t = useTranslations('act.budget');
  const tp = useTranslations('plan');
  const { goal, goals, plan, binding, bindError, retryBind } = useGoalPlan();
  const head = (sub?: string) => <ScreenHeader title={t('title')} sub={sub} />;

  if (goals.isLoading || binding || (goal && plan.isLoading)) {
    return (
      <Screen>
        {head()}
        <SkeletonCard lines={3} height={200} />
        <SkeletonCard lines={5} />
      </Screen>
    );
  }
  if (!goal) {
    return (
      <Screen>
        {head()}
        <EmptyState icon={I.target} title={tp('noGoalTitle')} sub={tp('noGoalSub')} action={tp('noGoalCta')} actionHref={href('S08')} />
      </Screen>
    );
  }
  if (bindError || plan.isError || !plan.data) {
    return (
      <Screen>
        {head()}
        <ErrorState error={bindError ?? plan.error} onRetry={bindError ? retryBind : () => void plan.refetch()} />
      </Screen>
    );
  }
  return <Body goal={goal} plan={plan.data} />;
}

function Body({ goal, plan }: { goal: Goal; plan: Plan }) {
  const t = useTranslations('act.budget');
  const tp = useTranslations('plan');
  const ts = useTServer();
  const { c, f } = useCz();
  const team = useTeam(goal.team_id);
  const b = plan.budget;
  const cur = b.total.currency;
  const m = (amount: number): Money => ({ amount: Math.round(amount), currency: cur });
  const cooling = plan.actions.reduce((a, x) => a + x.cooling_c, 0);
  const members = team.data?.members ?? [];
  const n = members.length;
  const anyEstimate = b.lines.some((l) => l.estimate);

  const tiles: [string, string][] = [
    n > 1 ? [t('perMember'), f.money(m(b.total.amount / n))] : [t('carePerYear'), f.money(b.care_per_year)],
    [t('perDeg'), cooling > 0 ? f.money(m(Math.round(b.total.amount / cooling / (f.unit === 'F' ? 1.8 : 1) / 100) * 100)) : '—'],
    [t('water'), t('waterVal', { l: f.num(b.water_l_week) })],
  ];

  return (
    <Screen>
      <ScreenHeader title={t('title')} sub={t('sub', { target: f.dC(goal.target_c), zone: goal.zone_name })} />

      <Card tone="navy" pad={20} gap={16} style={{ borderRadius: R.xxl }}>
        <View style={{ gap: 4 }}>
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {t('total')}
          </Txt>
          <Txt size={44} num color={B.white} lines={1} style={{ lineHeight: '48px', letterSpacing: -0.9 }}>
            {f.money(b.total)}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tiles.map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={11} color="rgba(255,255,255,0.75)" lines={1}>
                {label}
              </Txt>
              <Txt size={15} w={600} num color={B.white} lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>
        {cooling > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: R.md, backgroundColor: 'rgba(172,236,0,0.14)' }}>
            <Icon d={I.trend} size={18} color={B.lime} sw={2} />
            <Txt size={13} color={B.white} style={{ flex: 1 }}>
              {t('outcome') + ' '}
              <Txt as="span" size={13} w={600} color={B.lime}>
                {f.dC(-cooling)}
              </Txt>
              {' ' + t('byGoal', { date: f.date(goal.by_date, { month: 'short', year: 'numeric' }) })}
            </Txt>
          </View>
        ) : null}
      </Card>

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        {b.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: i < b.lines.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={500}>
                {ts(l.label)}
              </Txt>
              <Txt size={11.5} dim num>
                {t('unitCost', { qty: f.num(l.qty), cost: f.money(l.unit_cost) })}
              </Txt>
            </View>
            {l.estimate ? <Tag label={tp('estimate')} size="xs" bg={c.limeSoft} /> : null}
            <Txt size={13.5} w={600} num lines={1}>
              {f.money(l.total)}
            </Txt>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.line }}>
          <Txt size={13.5} w={500} style={{ flex: 1 }}>
            {t('carePerYear')}
          </Txt>
          <Txt size={13.5} w={600} num>
            {f.money(b.care_per_year)}
          </Txt>
        </View>
      </Card>

      <Card>
        {n > 1 ? (
          <>
            <Label>{t('split', { n: f.loc(n) })}</Label>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {members.slice(0, 6).map((mb, k) => (
                <View key={mb.user_id} label={`${mb.display_name}: ${f.money(m(b.total.amount / n))}`} role="img" style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
                  <Avatar ini={initials(mb.display_name)} bg={AVATARS[k % AVATARS.length][0]} fg={AVATARS[k % AVATARS.length][1]} size={40} src={mb.avatar_url} />
                  <Txt size={10.5} dim num lines={1}>
                    {f.money(m(b.total.amount / n))}
                  </Txt>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Label>{t('splitSolo')}</Label>
            <Txt size={13}>{t('splitSoloSub', { each: f.money(m(b.total.amount / 5)) })}</Txt>
          </>
        )}
      </Card>

      {anyEstimate ? (
        <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
          {t('estimateNote')}
        </Txt>
      ) : null}
      <SourceChips meta={plan.meta} estimate={anyEstimate} />

      <CzButton label={t('logAct')} icon="camera" href={href('S14', {}, { goal: goal.id })} />
    </Screen>
  );
}
