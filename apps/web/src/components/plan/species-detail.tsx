'use client';

/** S11 · Species detail (useSpeciesDetail): hero, facts, cooling share of the goal, care, price & nurseries. */
import { useTranslations } from 'next-intl';

import {
  B,
  Bar,
  Card,
  CzButton,
  ErrorState,
  GhostButton,
  GlassPill,
  I,
  Icon,
  IconBtn,
  Label,
  LightStatusBar,
  Photo,
  R,
  Screen,
  ScreenHeader,
  Skeleton,
  SkeletonCard,
  SourceChips,
  Tap,
  Txt,
  View,
  goBack,
  href,
  useCz,
} from '@/components/cz';
import { useNurseries, useSpeciesDetail } from '@/lib/data/hooks';
import type { Species } from '@/lib/data/types';

import { treeCoolingC, useGoalPlan } from './use-goal-plan';

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

export function SpeciesDetail({ id }: { id: string }) {
  const t = useTranslations('plan');
  const tc = useTranslations('common');
  const { point, goal, plan } = useGoalPlan();
  const q = useSpeciesDetail(id, point);

  if (q.isLoading) {
    return (
      <Screen bleed>
        <Skeleton h={360} r={0} />
        <View style={{ marginHorizontal: 16, gap: 14 }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <ScreenHeader title={t('speciesTitle')} />
        <ErrorState error={q.error} title={q.isError ? undefined : t('notFound')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  return <Body sp={q.data} point={point} goalTarget={goal?.target_c ?? null} planData={plan.data ?? null} back={tc('back')} />;
}

function Body({
  sp,
  point,
  goalTarget,
  planData,
  back,
}: {
  sp: Species;
  point: { lat: number; lng: number };
  goalTarget: number | null;
  planData: import('@/lib/data/types').Plan | null;
  back: string;
}) {
  const t = useTranslations('plan');
  const { c, f } = useCz();
  const nurseries = useNurseries(point);
  const name = sp.name;

  // Per-tree cooling: from the plan's tree action when there is one (zone-specific), else a 0.1 km² block.
  const treeAct = planData?.actions.find((a) => a.action_type === 'plant_tree');
  const perTree = treeAct && treeAct.qty > 0 ? treeAct.cooling_c / treeAct.qty : treeCoolingC(0.1);
  const inPlan = planData?.species.some((s) => s.id === sp.id) && treeAct ? Math.round(treeAct.qty / Math.max(1, planData.species.length)) : 0;
  const share = inPlan * perTree;

  const facts: [string, string][] = [
    [t('facts.canopy'), `${f.loc(sp.canopy_m)} m`],
    [t('facts.cooling'), t(`cooling.${sp.cooling}`)],
    [t('facts.water'), t(`waterNeed.${sp.water}`)],
    [t('facts.growth'), sp.growth],
    [t('facts.season'), sp.planting_season],
    ...(sp.price ? ([[t('facts.price'), f.money(sp.price)]] as [string, string][]) : []),
  ];
  const near = [...(nurseries.data?.nurseries ?? [])].sort((a, b) => a.dist_m - b.dist_m).slice(0, 2);

  return (
    <Screen bleed>
      <LightStatusBar />
      <Photo src={sp.image_url || BLANK} label={name} scrim={[[0, 0.5], [0.32, 0], [1, 0.88]]} priority style={{ height: 360, backgroundColor: B.photoBg2 }}>
        <IconBtn d={f.backPath} label={back} tone="glass" onPress={goBack} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 16 }} />
        <View style={{ position: 'absolute', start: 20, end: 20, bottom: 20, gap: 10, pointerEvents: 'none' }}>
          <View style={{ gap: 4 }}>
            <Txt display size={26} color={B.white} style={{ lineHeight: '30px' }} as="h1">
              {name}
            </Txt>
            <Txt size={15} color="rgba(255,255,255,0.92)" style={{ fontStyle: 'italic' }}>
              {sp.scientific}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {/* The API's `name` is already in the user's language; `local_name` is the other common name. */}
            <GlassPill style={{ minHeight: 30 }}>
              <Txt size={12} w={600} color={B.white}>
                {sp.local_name || sp.name}
              </Txt>
            </GlassPill>
            {sp.emoji ? (
              <GlassPill style={{ minHeight: 30 }}>
                <span aria-hidden>{sp.emoji}</span>
              </GlassPill>
            ) : null}
          </View>
        </View>
      </Photo>

      <View style={{ marginHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {facts.map(([label, val]) => (
          <View key={label} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 0, backgroundColor: c.card, borderRadius: R.lg, padding: 14, gap: 2 }}>
            <Txt size={11.5} dim>
              {label}
            </Txt>
            <Txt size={15} w={600} num>
              {val}
            </Txt>
          </View>
        ))}
      </View>

      <Card style={{ marginHorizontal: 16 }}>
        <Label>{t('coolingContribution')}</Label>
        <View style={{ gap: 2 }}>
          <Txt size={30} w={700} num color={c.leaf} lines={1} style={{ lineHeight: '34px', letterSpacing: -0.6 }}>
            {f.dC(-perTree, 4)}
          </Txt>
          <Txt size={12.5} dim>
            {treeAct ? t('perTree') : t('perTreeNoGoal')}
          </Txt>
        </View>
        {goalTarget != null && inPlan > 0 ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Txt size={12.5} style={{ flexShrink: 1 }}>
                {t('share', { n: f.loc(inPlan) })}
              </Txt>
              <Txt size={12.5} w={600} num>
                {f.dC(-share, 2)}
              </Txt>
            </View>
            <Bar pct={(share / Math.abs(goalTarget)) * 100} color={B.lime} />
          </View>
        ) : null}
        <Txt size={11} dim>
          {t('coolSrc')}
        </Txt>
      </Card>

      {sp.notes.length ? (
        <Card style={{ marginHorizontal: 16 }}>
          <Label>{t('care')}</Label>
          {sp.notes.map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <Icon d={I.check} size={12} sw={3} />
              </View>
              <Txt size={13.5} style={{ flex: 1 }}>
                {line}
              </Txt>
            </View>
          ))}
          {sp.native_regions.length ? (
            <Txt size={12} dim>
              {t('native') + ': ' + sp.native_regions.join(', ')}
            </Txt>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ marginHorizontal: 16 }} gap={10}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Label>{t('priceWhere')}</Label>
          {sp.price ? (
            <Txt size={15} w={600} num>
              {f.money(sp.price)}
            </Txt>
          ) : null}
        </View>
        {near.map((n) => (
          <Tap key={n.id} role="link" label={n.name} href={href('S12')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: c.line }}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={600}>
                {n.name}
              </Txt>
              <Txt size={12} dim>
                {[f.dist(n.dist_m), n.hours].filter(Boolean).join(' · ')}
              </Txt>
            </View>
            <Icon d={f.fwdPath} size={16} sw={2} />
          </Tap>
        ))}
      </Card>

      <View style={{ marginHorizontal: 16 }}>
        <SourceChips meta={sp.meta} ai={sp.estimate} />
      </View>

      <View style={{ marginHorizontal: 16, gap: 10 }}>
        <CzButton label={t('logPlanting')} icon="camera" href={href('S14', {}, { type: 'plant_tree', species: sp.id })} />
        <GhostButton label={t('findN')} href={href('S12')} />
      </View>
    </Screen>
  );
}
