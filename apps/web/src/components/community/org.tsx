'use client';
/** S18 · Organization page: photo hero, stats, goals across zones, contribution map, member teams. */
import { useTranslations } from 'next-intl';

import {
  Avatar,
  B,
  Bar,
  Card,
  EmptyState,
  ErrorState,
  I,
  Icon,
  IconBtn,
  Label,
  LightStatusBar,
  ListRow,
  Photo,
  R,
  Screen,
  ScreenHeader,
  SkeletonCard,
  SourceChips,
  Txt,
  View,
  goBack,
  href,
  useCz,
} from '@/components/cz';
import { useLeaderboard, useOrg } from '@/lib/data/hooks';
import type { Org } from '@/lib/data/types';

import { avatarFor, compact, coolingText, teamInitials } from './shared';

/** Unsplash: aerial view of trees and rooftops (Zac Gudakov) and a Dhaka basemap (Mahmud Ahsan); credited on About. */
const ORG_HERO = 'https://images.unsplash.com/photo-1628983065463-d59659ef4f18?auto=format&fit=crop&w=900&h=720&q=70';
const ORG_MAP = 'https://images.unsplash.com/photo-1592396131156-0d1a9c1f6869?auto=format&fit=crop&w=800&h=400&q=70';
/** Where member-team dots sit on the decorative 346×180 contribution map (one per team, layout only). */
const DOT_SLOTS: [number, number][] = [
  [90, 60],
  [150, 110],
  [230, 70],
  [270, 130],
  [120, 140],
  [300, 50],
];

export function OrgScreen({ id }: { id: string }) {
  const t = useTranslations('community');
  const org = useOrg(id);
  if (org.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('hub')} />
        <SkeletonCard lines={3} height={280} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (org.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('hub')} />
        <ErrorState error={org.error} onRetry={() => void org.refetch()} />
      </Screen>
    );
  }
  if (!org.data) {
    return (
      <Screen>
        <ScreenHeader title={t('orgNotFound.title')} />
        <EmptyState icon={I.community} title={t('orgNotFound.title')} sub={t('orgNotFound.sub')} action={t('hub')} actionHref={href('S16')} />
      </Screen>
    );
  }
  return <OrgBody org={org.data} />;
}

function OrgBody({ org }: { org: Org }) {
  const t = useTranslations('community');
  const tc = useTranslations('common');
  const { c, f } = useCz();
  const board = useLeaderboard({ subject: 'org', scope: 'area', period: 'all' });
  const row = board.data ? (board.data.rows.find((r) => r.id === org.id) ?? (board.data.me?.id === org.id ? board.data.me : null)) : null;
  const goals = org.goals ?? [];
  const stats: [string, string][] = [
    [row ? `#${f.loc(row.rank)}` : '–', t('orgStats.rank')],
    [f.loc(org.teams.length), t('orgStats.teams')],
    [f.loc(goals.length), t('orgStats.zones')],
    [f.loc(compact(row?.points ?? org.totals.points)), t('orgStats.points')],
  ];

  return (
    <Screen bleed>
      <LightStatusBar />
      <Photo
        src={ORG_HERO}
        label={t('orgHeroA11y')}
        priority
        style={{ height: 'calc(env(safe-area-inset-top, 0px) + 300px)', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
        scrim={[
          [0, 0.5],
          [0.35, 0],
          [1, 0.88],
        ]}>
        <IconBtn d={f.backPath} label={tc('back')} tone="glass" onPress={goBack} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 16 }} />
        <View style={{ position: 'absolute', start: 20, end: 20, bottom: 20, gap: 8, pointerEvents: 'none' }}>
          {org.verified ? (
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: B.blue }}>
              <Icon d={I.check} size={14} sw={2.6} color={B.white} />
              <Txt size={11.5} w={600} color={B.white}>
                {t('verifiedOrg')}
              </Txt>
            </View>
          ) : null}
          <Txt display size={24} color={B.white} as="h1">
            {org.name}
          </Txt>
          {org.description ? (
            <Txt size={13} color="rgba(255,255,255,0.9)">
              {t('orgSub', { description: org.description })}
            </Txt>
          ) : null}
        </View>
      </Photo>

      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {stats.map(([val, label]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 }}>
              <Txt size={18} w={600} num lines={1}>
                {val}
              </Txt>
              <Txt size={10.5} dim center lines={1}>
                {label}
              </Txt>
            </View>
          ))}
        </View>

        {goals.length ? (
          <Card gap={14}>
            <Label>{t('goalsZones')}</Label>
            {goals.map((g) => (
              <View key={g.zone_name} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Txt size={13.5} w={600} style={{ flexShrink: 1 }}>
                    {g.zone_name}
                  </Txt>
                  <Txt size={12.5} dim lines={1}>
                    {t('goalLine', { target: f.dC(g.target_c), date: f.date(g.by_date, { month: 'short', year: 'numeric' }) })}
                  </Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Bar pct={g.progress_pct} style={{ flex: 1 }} label={`${g.zone_name} ${f.pct(g.progress_pct)}`} />
                  <View style={{ width: 40, alignItems: 'flex-end' }}>
                    <Txt size={12} w={600} num>
                      {f.pct(g.progress_pct)}
                    </Txt>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        <Card pad={12} gap={10}>
          <Label style={{ paddingHorizontal: 4, paddingTop: 4 }}>{t('contribMap')}</Label>
          <Photo src={ORG_MAP} label={t('contribA11y')} style={{ height: 180, borderRadius: 18 }}>
            <svg width="100%" height="100%" viewBox="0 0 346 180" preserveAspectRatio="xMidYMid meet" aria-hidden style={{ position: 'absolute', inset: 0, direction: 'ltr' }}>
              {org.teams.slice(0, DOT_SLOTS.length).map((tm, i) => {
                const [x, y] = DOT_SLOTS[i];
                const r = 6 + Math.min(6, Math.sqrt(Math.max(0, tm.stats.points)) / 18);
                return <circle key={tm.id} cx={x} cy={y} r={r} fill={B.lime} fillOpacity={0.85} stroke={B.navy} strokeWidth={2} />;
              })}
            </svg>
          </Photo>
        </Card>

        <View style={{ gap: 8 }}>
          <Label style={{ paddingHorizontal: 4 }}>{t('orgTeams')}</Label>
          <View style={{ backgroundColor: c.card, borderRadius: R.xl, paddingVertical: 6, paddingHorizontal: 16 }}>
            {org.teams.map((tm, i) => {
              const av = avatarFor(tm.name);
              return (
                <ListRow key={tm.id} last={i === org.teams.length - 1} label={tm.name} href={href('S17', { id: tm.id })}>
                  <Avatar ini={teamInitials(tm.name)} bg={av[0]} fg={av[1]} size={38} square />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Txt size={13.5} w={600} lines={1}>
                      {tm.name}
                    </Txt>
                    <Txt size={11.5} dim>
                      {t('orgTeamMeta', { trees: f.num(tm.stats.trees), cooling: coolingText(f.dC, tm.stats.cooling_c) })}
                    </Txt>
                  </View>
                  <Txt size={13} w={600} num>
                    {f.num(tm.stats.points)}
                  </Txt>
                </ListRow>
              );
            })}
          </View>
        </View>
        {org.my_role === 'admin' ? (
          // R9: CSV of the teams' numbers for the org's admins.
          <a href={`/api/v1/orgs/${encodeURIComponent(org.id)}/export.csv`} download style={{ alignSelf: 'flex-start', minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: 999, border: `1px solid ${c.line}`, color: c.ink, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
            {t('orgExport')}
          </a>
        ) : null}
        <SourceChips demo={org.is_demo} />
      </View>
    </Screen>
  );
}
