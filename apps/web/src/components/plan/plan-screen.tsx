'use client';

/** S10 · Your plan (tab root): progress, ranked actions, planting map, species, nurseries, steps. */
import { useTranslations } from 'next-intl';

import {
  B,
  Bar,
  Card,
  CzButton,
  EmptyState,
  ErrorState,
  GhostButton,
  HScroll,
  I,
  Icon,
  Photo,
  R,
  Screen,
  ScreenHeader,
  SectionTitle,
  Skeleton,
  SkeletonCard,
  SourceChips,
  Spinner,
  Tap,
  Txt,
  View,
  href,
  useCz,
} from '@/components/cz';
import { ACTION_ICON, EFFECT_KEY } from '@/components/act/action-meta';
import { useNurseries, usePlantingSpots } from '@/lib/data/hooks';
import type { Goal, Plan, PlanAction, SpeciesSummary } from '@/lib/data/types';
import { useTServer } from '@/i18n/server-text';

import { PlantingMap } from './planting-map';
import { SpeciesCatalog } from './species-catalog';
import { useGoalPlan } from './use-goal-plan';

export function PlanScreen() {
  const t = useTranslations('plan');
  const { f } = useCz();
  const { goal, goals, plan, point, binding, bindError, retryBind } = useGoalPlan();

  const header = (sub?: string) => <ScreenHeader title={t('planTitle')} sub={sub} back={false} big />;

  if (goals.isLoading || !goals.data) {
    return (
      <Screen tab>
        {header()}
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} height={220} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (goals.isError) {
    return (
      <Screen tab>
        {header()}
        <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
      </Screen>
    );
  }
  if (!goal) {
    return (
      <Screen tab>
        {header()}
        <EmptyState icon={I.target} title={t('noGoalTitle')} sub={t('noGoalSub')} action={t('noGoalCta')} actionHref={href('S08')} />
        <SpeciesCatalog point={point} />
      </Screen>
    );
  }

  const sub = `${goal.zone_name} · ${f.dC(goal.target_c)} · ${f.date(goal.by_date)}`;
  if (bindError) {
    return (
      <Screen tab>
        {header(sub)}
        <ErrorState error={bindError} onRetry={retryBind} />
      </Screen>
    );
  }
  if (binding || plan.isLoading) {
    return (
      <Screen tab>
        {header(sub)}
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Txt size={13} dim>
            {binding ? t('binding') : t('loadingPlan')}
          </Txt>
        </Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton h={64} r={20} style={{ flex: 1 }} />
          <Skeleton h={64} r={20} style={{ flex: 1 }} />
          <Skeleton h={64} r={20} style={{ flex: 1 }} />
        </View>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (plan.isError || !plan.data) {
    return (
      <Screen tab>
        {header(sub)}
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      </Screen>
    );
  }
  return <PlanBody goal={goal} plan={plan.data} sub={sub} point={point} header={header(sub)} />;
}

function PlanBody({ goal, plan, header, point }: { goal: Goal; plan: Plan; sub: string; point: { lat: number; lng: number }; header: React.ReactNode }) {
  const t = useTranslations('plan');
  const ta = useTranslations('act');
  const ts = useTServer();
  const { c, f } = useCz();
  const spots = usePlantingSpots(goal.zone_id);
  const nurseries = useNurseries(goal.zone_centroid);

  const modeled = plan.actions.reduce((a, x) => a + x.cooling_c, 0);
  const currency = plan.budget.total.currency === 'BDT' ? '৳' : plan.budget.total.currency;
  const ratios = plan.actions.map((a) => (a.cost.amount > 0 ? a.cooling_c / a.cost.amount : 0));
  const maxRatio = Math.max(...ratios, 1e-12);
  const anyEstimate = plan.actions.some((a) => a.estimate);
  const near = nurseries.data?.nurseries ?? [];
  const nearest = near.length ? Math.min(...near.map((n) => n.dist_m)) : null;
  const totals = spots.data?.totals;

  const actionHref = (a: PlanAction) =>
    a.action_type === 'plant_tree' ? href('S11', { id: plan.species[0]?.id ?? 'neem' }) : a.action_type === 'awareness' ? href('S14', {}, { type: a.action_type }) : href('S13');

  return (
    <Screen tab>
      {header}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatCard label={t('modeled')} value={modeled ? f.dC(-modeled, 1) : '—'} color={c.leaf} />
        <StatCard label={t('budget') + (f.rtl ? ' ←' : ' →')} value={f.money(plan.budget.total)} href={href('S13')} />
        <StatCard label={t('progress')} value={f.pct(goal.progress_pct, 0)} />
      </View>

      <Card gap={10}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <Txt label>{t('progress')}</Txt>
          <Txt size={12} dim num>
            {t('progressOf', { pct: f.pct(goal.progress_pct, 0), target: f.dC(goal.target_c) })}
          </Txt>
        </View>
        <Bar pct={goal.progress_pct} color={B.lime} label={t('progress')} />
        {plan.next_task ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={ACTION_ICON[plan.next_task.action_type]} size={20} sw={1.8} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={11.5} dim>
                {t('nextTask')}
              </Txt>
              <Txt size={13.5} w={600}>
                {plan.next_task.text}
              </Txt>
            </View>
          </View>
        ) : null}
      </Card>

      <View style={{ gap: 10 }}>
        <SectionTitle title={t('actions', { currency })} />
        {plan.actions.map((a, i) => {
          const eff = EFFECT_KEY[a.action_type];
          const w = ratios[i] > 0 ? Math.max(6, (ratios[i] / maxRatio) * 100) : 0;
          return (
            <Tap
              key={a.action_type}
              href={actionHref(a)}
              label={`${f.loc(i + 1)}. ${ta(`type.${a.action_type}`)}, ${f.dC(-a.cooling_c, 2)}`}
              style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={ACTION_ICON[a.action_type]} size={22} sw={1.7} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={14.5} w={600}>
                    {f.loc(i + 1) + '. ' + ta(`type.${a.action_type}`)}
                  </Txt>
                  <Txt size={12} dim>
                    {ts(a.why)}
                  </Txt>
                </View>
                <Txt size={15} w={600} num color={c.leaf} lines={1}>
                  {a.cooling_c > 0 ? f.dC(-a.cooling_c, 2) : '—'}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {a.cost.amount > 0 ? <Chip text={f.money(a.cost)} /> : null}
                {eff ? <Chip text={t('effectIn', { time: t(eff) })} /> : null}
                {a.water_l_week > 0 ? <Chip text={t('water', { l: f.num(a.water_l_week) })} /> : null}
                <Chip text={t(`effort.${a.effort}`)} />
                {a.estimate ? <Chip text={t('estimate')} ai /> : null}
              </View>
              {w > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt size={10.5} dim lines={1}>
                    {t('perMoney', { currency })}
                  </Txt>
                  <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.soft, overflow: 'hidden' }}>
                    <View style={{ width: `${w}%`, height: '100%', borderRadius: 3, backgroundColor: B.lime }} />
                  </View>
                </View>
              ) : null}
            </Tap>
          );
        })}
      </View>

      <Card pad={12} gap={10}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 4, paddingTop: 2 }}>
          <Txt size={13.5} w={600} as="h2">
            {t('whereTitle')}
          </Txt>
          {totals ? (
            <Txt size={11.5} dim style={{ flexShrink: 1, textAlign: 'end' }}>
              {t('spotsSummary', { ground: f.area2(totals.ground_m2), roof: f.area2(totals.roof_m2), edge: f.dist(totals.roadside_m) })}
            </Txt>
          ) : null}
        </View>
        {spots.isError ? (
          <ErrorState compact error={spots.error} onRetry={() => void spots.refetch()} />
        ) : (
          <PlantingMap spots={spots.data} center={goal.zone_centroid} zoneName={goal.zone_name} height={240} />
        )}
        <Txt size={12} dim style={{ paddingHorizontal: 4 }}>
          {t('whereNote')}
        </Txt>
        {spots.data ? <SourceChips meta={spots.data.meta} style={{ paddingHorizontal: 4 }} /> : null}
        <Tap
          label={t('editMap')}
          haptic
          href={href('S09', { id: goal.id })}
          style={{ height: 44, borderRadius: R.pill, backgroundColor: B.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon d={I.pin} size={16} color={B.lime} sw={2} />
          <Txt size={13} w={600} color={B.white}>
            {t('editMap')}
          </Txt>
        </Tap>
      </Card>

      {plan.species.length ? (
        <View style={{ gap: 10 }}>
          <SectionTitle title={t('species')} />
          <HScroll gap={10} style={{ paddingBottom: 4 }}>
            {plan.species.map((s) => (
              <SpeciesCard key={s.id} s={s} />
            ))}
          </HScroll>
        </View>
      ) : null}

      <SpeciesCatalog point={point} />

      <Tap href={href('S12')} label={t('nurseries')} style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.pin} size={22} sw={1.7} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={14} w={600}>
            {t('nurseries')}
          </Txt>
          <Txt size={12} dim>
            {nearest != null ? t('nurseLine', { n: f.loc(near.length), dist: f.dist(nearest) }) : t('nurseLineNone')}
          </Txt>
        </View>
        <Icon d={f.fwdPath} size={16} sw={2} />
      </Tap>

      {plan.steps.length ? (
        <Card gap={4}>
          <Txt label style={{ paddingBottom: 8 }}>
            {t('steps')}
          </Txt>
          {plan.steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 24, alignItems: 'center' }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: i === 0 ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={11.5} w={700} color={i === 0 ? B.limeInk : c.ink}>
                    {f.loc(i + 1)}
                  </Txt>
                </View>
                <View style={{ flex: 1, width: 2, backgroundColor: c.line, opacity: i < plan.steps.length - 1 ? 1 : 0 }} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2, paddingBottom: 14 }}>
                <Txt size={13.5} w={600}>
                  {s.title}
                </Txt>
                <Txt size={12.5} dim>
                  {s.detail}
                </Txt>
              </View>
            </View>
          ))}
          {plan.care_plan ? (
            <View style={{ backgroundColor: c.soft, borderRadius: R.md, padding: 12, gap: 4 }}>
              <Txt size={12} w={600}>
                {t('carePlan')}
              </Txt>
              <Txt size={12.5}>{plan.care_plan}</Txt>
            </View>
          ) : null}
        </Card>
      ) : null}

      <SourceChips meta={plan.meta} ai={anyEstimate} />

      <View style={{ gap: 10 }}>
        <CzButton label={goal.progress_pct > 0 ? t('logNext') : t('logFirst')} icon="camera" href={href('S14', {}, { goal: goal.id })} />
        <GhostButton label={t('seeBudget')} href={href('S13')} />
      </View>
    </Screen>
  );
}

function SpeciesCard({ s }: { s: SpeciesSummary }) {
  const { c } = useCz();
  const t = useTranslations('plan');
  const name = s.name;
  return (
    <Tap href={href('S11', { id: s.id })} label={name} role="link" style={{ width: 150, backgroundColor: c.card, borderRadius: 22, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 12, gap: 8 }}>
      {s.image_url ? (
        <Photo src={s.image_url} label={name} style={{ width: '100%', height: 100, borderRadius: R.md, backgroundColor: B.photoBg2 }} />
      ) : (
        <View style={{ width: '100%', height: 100, borderRadius: R.md, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <span aria-hidden style={{ fontSize: 40 }}>
            {s.emoji ?? '🌳'}
          </span>
        </View>
      )}
      <View style={{ gap: 1, paddingHorizontal: 4 }}>
        <Txt size={13.5} w={600} lines={1}>
          {name}
        </Txt>
        <Txt size={11.5} dim lines={1} style={{ fontStyle: 'italic' }}>
          {s.scientific}
        </Txt>
        <Txt size={11} dim lines={1}>
          {t(`cooling.${s.cooling}`)}
        </Txt>
      </View>
    </Tap>
  );
}

function StatCard({ label, value, color, href: to }: { label: string; value: string; color?: string; href?: string }) {
  const { c } = useCz();
  const body = (
    <>
      <Txt size={11} dim lines={1}>
        {label}
      </Txt>
      <Txt size={15} w={600} num color={color} lines={1}>
        {value}
      </Txt>
    </>
  );
  const style = { flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: R.lg, padding: 12, gap: 4 };
  return to ? (
    <Tap label={`${label} ${value}`} href={to} style={style}>
      {body}
    </Tap>
  ) : (
    <View style={style}>{body}</View>
  );
}

export function Chip({ text, ai }: { text: string; ai?: boolean }) {
  const { c } = useCz();
  return (
    <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: ai ? c.limeSoft : c.soft, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {ai ? <Icon d={I.sparkleOne} size={11} sw={2} /> : null}
      <Txt size={11.5} num>
        {text}
      </Txt>
    </View>
  );
}
