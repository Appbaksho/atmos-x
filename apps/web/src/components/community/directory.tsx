'use client';
/** P3 · My teams (/app/team): teams I'm in and public teams to discover. P4 · Organizations (/app/org): the directory. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { B, Card, EmptyState, ErrorState, Field, I, Icon, R, Screen, ScreenHeader, SkeletonCard, Tap, Txt, View, href, requireAccount, useCz } from '@/components/cz';
import { useDiscoverTeams, useOrgs, useSession, useTeams } from '@/lib/data/hooks';
import type { Org, Team } from '@/lib/data/types';

import { VerifiedSeal } from './shared';

function TeamRow({ team }: { team: Team }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  return (
    <Tap label={team.name} href={href('S17', { id: team.id })} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, textAlign: 'start' }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
        <span aria-hidden style={{ fontSize: 20 }}>
          {team.emoji ?? '🌳'}
        </span>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14} w={600} lines={1}>
          {team.name}
        </Txt>
        <Txt size={12} dim lines={1}>
          {[t('teamMeta', { count: team.members.length, n: f.loc(team.members.length) }), team.org_name, team.area].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      <Txt size={13} w={600} num>
        {f.num(team.stats.points)}
      </Txt>
      <Icon d={f.fwdPath} size={16} sw={2} />
    </Tap>
  );
}

export function MyTeamsPage() {
  const t = useTranslations('community.dir');
  const session = useSession();
  const mine = useTeams();
  const [q, setQ] = useState('');
  const discover = useDiscoverTeams(q);
  return (
    <Screen>
      <ScreenHeader title={t('teamsTitle')} sub={t('teamsSub')} />
      <Txt label as="h2" style={{ paddingHorizontal: 4 }}>
        {t('mine')}
      </Txt>
      {mine.isPending ? (
        <SkeletonCard lines={2} height={90} />
      ) : mine.isError ? (
        <ErrorState compact error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.data?.length ? (
        mine.data.map((tm) => <TeamRow key={tm.id} team={tm} />)
      ) : (
        <EmptyState
          icon={I.community}
          title={t('noTeams')}
          sub={session.isGuest ? t('guestSub') : t('noTeamsSub')}
          action={t('create')}
          actionHref={session.isGuest ? undefined : href('S19')}
          onAction={session.isGuest ? () => requireAccount(t('feature')) : undefined}
        />
      )}
      <Txt label as="h2" style={{ paddingHorizontal: 4, paddingTop: 8 }}>
        {t('discover')}
      </Txt>
      <Field label={t('search')} value={q} onChangeText={setQ} placeholder={t('searchPh')} maxLength={80} />
      {discover.isPending ? (
        <SkeletonCard lines={3} height={140} />
      ) : discover.isError ? (
        <ErrorState compact error={discover.error} />
      ) : (discover.data ?? []).filter((x) => !x.is_member).length ? (
        (discover.data ?? []).filter((x) => !x.is_member).map((tm) => <TeamRow key={tm.id} team={tm} />)
      ) : (
        <Card>
          <Txt size={13} dim>
            {t('noDiscover')}
          </Txt>
        </Card>
      )}
    </Screen>
  );
}

function OrgRow({ org }: { org: Org }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  return (
    <Tap label={org.name} href={href('S18', { id: org.id })} style={{ backgroundColor: c.card, borderRadius: R.xl, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, textAlign: 'start' }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <span aria-hidden style={{ fontSize: 20 }}>
          {org.logo_emoji ?? '🏫'}
        </span>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt size={14} w={600} lines={1}>
            {org.name}
          </Txt>
          {org.verified ? <VerifiedSeal size={16} label={t('verifiedOrg')} /> : null}
        </View>
        <Txt size={12} dim lines={1}>
          {[t(`orgKind.${org.kind}`), org.city, t('orgMetaPlain', { count: org.teams.length, n: f.loc(org.teams.length) })].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      <Txt size={13} w={600} num>
        {f.num(org.totals.points)}
      </Txt>
    </Tap>
  );
}

export function OrgsPage() {
  const t = useTranslations('community.dir');
  const [q, setQ] = useState('');
  const orgs = useOrgs(q);
  return (
    <Screen>
      <ScreenHeader title={t('orgsTitle')} sub={t('orgsSub')} />
      <Field label={t('search')} value={q} onChangeText={setQ} placeholder={t('searchPh')} maxLength={80} />
      {orgs.isPending ? (
        <SkeletonCard lines={3} height={140} />
      ) : orgs.isError ? (
        <ErrorState error={orgs.error} onRetry={() => void orgs.refetch()} />
      ) : orgs.data?.length ? (
        orgs.data.map((o) => <OrgRow key={o.id} org={o} />)
      ) : (
        <EmptyState icon={I.community} title={t('noOrgs')} sub={t('noOrgsSub')} />
      )}
    </Screen>
  );
}
