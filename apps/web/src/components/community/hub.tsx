'use client';
/** S16 · Community hub (tab root): my teams, join by code, feed, events, leaderboards (people/teams/orgs × area/city/country × period) and discover. */
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  Avatar,
  B,
  Card,
  CzButton,
  EmptyState,
  ErrorState,
  Field,
  I,
  Icon,
  IconBtn,
  Label,
  R,
  Screen,
  ScreenHeader,
  SectionTitle,
  Seg,
  SkeletonCard,
  SourceChips,
  Tap,
  Txt,
  View,
  go,
  href,
  requireAccount,
  useCz,
  useLocation,
} from '@/components/cz';
import { initials } from '@/lib/format';
import { useDiscoverTeams, useLeaderboard, useOrg, useSession, useTeams } from '@/lib/data/hooks';
import type { LeaderboardScope, LeaderboardSubject, Period, Team } from '@/lib/data/types';

import { EventsSection } from './events';
import { FeedSection } from './feed';
import { formatCode } from './invite-link';
import { avatarAt, avatarFor, freePlaces, teamInitials, VerifiedSeal } from './shared';

const SUBJECTS: LeaderboardSubject[] = ['user', 'team', 'org'];
const SCOPES: LeaderboardScope[] = ['area', 'city', 'country'];
const PERIODS: Period[] = ['week', 'month', 'all'];

export function CommunityHub() {
  const t = useTranslations('community');
  const { placeName } = useLocation();
  const session = useSession();

  return (
    <Screen tab gap={16}>
      <ScreenHeader
        title={t('hub')}
        sub={placeName ? t('hubSub', { place: placeName }) : t('hubSubFallback')}
        back={false}
        big
        right={
          <IconBtn
            d={I.plus}
            label={t('newTeamA11y')}
            tone="lime"
            iconSize={20}
            href={session.isGuest ? undefined : href('S19')}
            onPress={session.isGuest ? () => requireAccount(t('noTeam.feature')) : undefined}
          />
        }
      />
      <MyClans />
      <JoinByCode />
      <FeedSection />
      <EventsSection />
      <Boards />
      <Discover />
      <Links />
    </Screen>
  );
}

/* ───────────────────────────── My clans ───────────────────────────── */

function MyClans() {
  const t = useTranslations('community');
  const session = useSession();
  const teams = useTeams();

  if (!session.ready || teams.isPending) {
    return (
      <View style={{ gap: 10 }}>
        <Label style={{ paddingHorizontal: 4 }}>{t('myClans')}</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SkeletonCard lines={2} height={118} style={{ flex: 1 }} />
          <SkeletonCard lines={2} height={118} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }
  if (teams.isError) return <ErrorState error={teams.error} onRetry={() => void teams.refetch()} compact />;

  const list = teams.data ?? [];
  if (!list.length) {
    return (
      <View style={{ gap: 10 }}>
        <Label style={{ paddingHorizontal: 4 }}>{t('myClans')}</Label>
        <EmptyState
          icon={I.community}
          title={t('noTeam.title')}
          sub={session.isGuest ? t('noTeam.guestSub') : t('noTeam.sub')}
          action={t('noTeam.create')}
          actionHref={session.isGuest ? undefined : href('S19')}
          onAction={session.isGuest ? () => requireAccount(t('noTeam.feature')) : undefined}
        />
      </View>
    );
  }

  const orgIds = [...new Set(list.map((x) => x.org_id).filter((x): x is string => !!x))];
  return (
    <View style={{ gap: 10 }}>
      <Label style={{ paddingHorizontal: 4 }}>{t('myClans')}</Label>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {list.map((team) => (
          <TeamClanCard key={team.id} team={team} />
        ))}
        {orgIds.map((id) => (
          <OrgClanCard key={id} id={id} />
        ))}
      </View>
    </View>
  );
}

const CLAN_CARD = { flexGrow: 1, flexBasis: 150, minWidth: 0, borderRadius: R.xl, padding: 14, gap: 12 } as const;

function TeamClanCard({ team }: { team: Team }) {
  const t = useTranslations('community');
  const { f } = useCz();
  const goal = team.goal ? Math.round(team.goal.progress_pct) : null;
  const meta = t('teamMeta', { count: team.members.length, n: f.loc(team.members.length) });
  return (
    <Tap label={t('clanA11y', { name: team.name, meta })} href={href('S17', { id: team.id })} style={[CLAN_CARD, { backgroundColor: B.navy }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Avatar ini={teamInitials(team.name)} bg={B.lime} fg={B.limeInk} size={40} square />
        {goal != null ? (
          <Txt size={22} w={600} num color={B.lime}>
            {f.pct(goal)}
          </Txt>
        ) : (
          <Txt size={13} w={600} num color={B.lime}>
            {f.num(team.stats.points)}
          </Txt>
        )}
      </View>
      <View style={{ gap: 2 }}>
        <Txt size={14} w={600} color={B.white} lines={1}>
          {team.name}
        </Txt>
        <Txt size={11.5} color="rgba(255,255,255,0.75)" lines={1}>
          {meta}
        </Txt>
      </View>
    </Tap>
  );
}

function OrgClanCard({ id }: { id: string }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  const org = useOrg(id);
  if (org.isPending) return <SkeletonCard lines={2} height={118} style={{ flexGrow: 1, flexBasis: 150 }} />;
  if (!org.data) return null;
  const o = org.data;
  const n = o.teams.length;
  const meta = o.verified ? t('orgMeta', { count: n, n: f.loc(n) }) : t('orgMetaPlain', { count: n, n: f.loc(n) });
  return (
    <Tap label={t('clanA11y', { name: o.name, meta })} href={href('S18', { id: o.id })} style={[CLAN_CARD, { backgroundColor: c.card }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Avatar ini={teamInitials(o.name)} bg={B.blue} fg={B.white} size={40} square />
        {o.verified ? <VerifiedSeal label={t('verifiedOrg')} /> : null}
      </View>
      <View style={{ gap: 2 }}>
        <Txt size={14} w={600} lines={1}>
          {o.name}
        </Txt>
        <Txt size={11.5} dim lines={1}>
          {meta}
        </Txt>
      </View>
    </Tap>
  );
}

/* ───────────────────────────── Join by code ───────────────────────────── */

export function JoinByCode() {
  const t = useTranslations('community.joinCode');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const c = formatCode(code);
    if (!/^[A-Z0-9]{6}$/.test(c)) return setErr(t('invalid'));
    setErr(null);
    go('join', { code: c });
  };
  return (
    <Card pad={14} gap={10}>
      <form onSubmit={submit} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field
            label={t('label')}
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase().slice(0, 8));
              setErr(null);
            }}
            placeholder={t('placeholder')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            error={err}
            style={{ height: 46, letterSpacing: 1.5 }}
          />
        </View>
        <CzButton label={t('go')} size="sm" variant="navy" type="submit" style={{ marginBottom: err ? 22 : 0 }} />
      </form>
    </Card>
  );
}

/* ───────────────────────────── Leaderboards ───────────────────────────── */

function Boards() {
  const t = useTranslations('community');
  const { c, f } = useCz();
  const [subject, setSubject] = useState<LeaderboardSubject>('team');
  const [scope, setScope] = useState<LeaderboardScope>('area');
  const [period, setPeriod] = useState<Period>('all');
  const board = useLeaderboard({ subject, scope, period });
  const noPlace = board.data?.status === 'no_place';

  const youSuffix = { user: t('you'), team: t('yourTeam'), org: t('yourOrg') }[subject];
  const rows = useMemo(() => {
    const d = board.data;
    if (!d) return [];
    const top = d.rows;
    const extra = d.me && !top.some((r) => r.id === d.me!.id) ? [d.me] : [];
    return [...top, ...extra];
  }, [board.data]);

  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t('boards')} style={{ paddingTop: 4 }} />
      <Seg tone="card" height={40} label={t('boardsLabel')} value={subject} onChange={setSubject} options={SUBJECTS.map((s) => ({ label: t(`who.${s}`), value: s }))} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <View role="tablist" label={t('boards')} style={{ flexDirection: 'row', gap: 6 }}>
          {SCOPES.map((s) => {
            const on = scope === s;
            return (
              <Tap
                key={s}
                role="tab"
                selected={on}
                label={t(`scope.${s}`)}
                haptic
                onPress={() => setScope(s)}
                style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1.5, borderColor: on ? c.ink : c.line, justifyContent: 'center' }}>
                <Txt size={12} w={600} color={on ? c.ink : c.ink2}>
                  {t(`scope.${s}`)}
                </Txt>
              </Tap>
            );
          })}
        </View>
        <View style={{ flex: 1, minWidth: 0 }} />
        <Seg tone="card" height={32} value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ label: t(`period.${p}`), value: p }))} style={{ minWidth: 200 }} />
      </View>

      {board.isPending ? (
        <SkeletonCard lines={5} height={300} />
      ) : board.isError ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : !rows.length ? (
        <EmptyState title={noPlace ? t('boardNoPlace') : t('boardEmpty')} sub={noPlace ? t('boardNoPlaceSub') : undefined} icon={I.trend} actionHref={noPlace ? href('S22') : undefined} action={noPlace ? t('boardSetPlace') : undefined} />
      ) : (
        <View style={{ backgroundColor: c.card, borderRadius: R.xl, paddingVertical: 4, paddingHorizontal: 14 }}>
          {rows.map((r, i) => {
            const gap = i > 0 && r.rank > rows[i - 1].rank + 1;
            const av = r.is_me ? avatarAt(0) : avatarFor(r.name);
            const target = r.href ? href(r.href.screen === 'user' ? 'user' : r.href.screen === 'S17' ? 'S17' : 'S18', { id: r.href.id }) : undefined;
            const name = r.is_me ? `${r.name} ${youSuffix}` : r.name;
            const body = (
              <>
                <Txt size={13} w={600} dim num style={{ minWidth: 28 }} lines={1}>
                  {f.loc(r.rank)}
                </Txt>
                <Avatar ini={subject === 'user' ? initials(r.name) : teamInitials(r.name)} bg={av[0]} fg={av[1]} size={36} square={subject !== 'user'} src={r.avatar_url ?? undefined} />
                <Txt size={14} w={r.is_me ? 600 : 500} lines={1} style={{ flex: 1, minWidth: 0 }}>
                  {name}
                </Txt>
                <Txt size={13} w={600} num>
                  {f.num(r.points)}
                </Txt>
              </>
            );
            const rowStyle = {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 10,
              paddingHorizontal: 8,
              marginHorizontal: -8,
              borderRadius: 14,
              backgroundColor: r.is_me ? c.limeSoft : 'transparent',
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: c.line,
              borderTopStyle: gap ? 'dashed' : 'solid',
              textAlign: 'start',
            } as const;
            const a11y = t('rowA11y', { rank: f.loc(r.rank), name, points: f.num(r.points) });
            return target ? (
              <Tap key={r.id} label={a11y} href={target} style={rowStyle}>
                {body}
              </Tap>
            ) : (
              <View key={r.id} role="group" label={a11y} style={rowStyle}>
                {body}
              </View>
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingHorizontal: 4 }}>
        <SourceChips meta={board.data?.meta} />
        <Txt size={11.5} dim style={{ flex: 1, minWidth: 180 }}>
          {t('boardNote')}
        </Txt>
      </View>
    </View>
  );
}

/* ───────────────────────────── Discover ───────────────────────────── */

/** Public teams with free places that I'm not in. */
function Discover() {
  const t = useTranslations('community');
  const q = useDiscoverTeams();
  const list = (q.data ?? []).filter((x) => !x.is_member).slice(0, 5);
  if (q.isPending || q.isError || !list.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t('discover')} action={t('seeAll')} actionHref={href('teams')} />
      <Txt size={12} dim style={{ paddingHorizontal: 4, marginTop: -6 }}>
        {t('discoverSub')}
      </Txt>
      <Card pad={0} gap={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
        {list.map((tm) => (
          <DiscoverRow key={tm.id} tm={tm} />
        ))}
      </Card>
    </View>
  );
}

function DiscoverRow({ tm }: { tm: Team }) {
  const t = useTranslations('community');
  const { c, f } = useCz();
  const free = freePlaces(tm);
  const av = avatarFor(tm.name);
  return (
    <Tap
      label={`${tm.name}, ${t('spots', { n: f.loc(tm.members.length), max: f.loc(tm.max_members) })}`}
      href={href('S17', { id: tm.id })}
      className="cz-discover-row"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.line, textAlign: 'start' }}>
      <Avatar ini={teamInitials(tm.name)} bg={av[0]} fg={av[1]} size={38} square />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={13.5} w={600} lines={1}>
          {tm.name}
        </Txt>
        <Txt size={11.5} dim lines={1}>
          {[tm.area, tm.org_name].filter(Boolean).join(' · ') || t('spots', { n: f.loc(tm.members.length), max: f.loc(tm.max_members) })}
        </Txt>
      </View>
      <View style={{ height: 26, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: free > 0 ? c.limeSoft : c.soft, justifyContent: 'center' }}>
        <Txt size={11.5} w={600} num>
          {free > 0 ? t('spots', { n: f.loc(tm.members.length), max: f.loc(tm.max_members) }) : t('full')}
        </Txt>
      </View>
      <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
    </Tap>
  );
}

/* ───────────────────────────── Links ───────────────────────────── */

function Links() {
  const t = useTranslations('community');
  const { c } = useCz();
  const session = useSession();
  const isMod = session.role === 'moderator' || session.role === 'admin';
  const items: [string, string][] = [
    [t('linkTeams'), href('teams')],
    [t('linkOrgs'), href('orgs')],
    [t('linkEvents'), href('events')],
    ...(isMod ? ([[t('linkModeration'), href('moderation')]] as [string, string][]) : []),
  ];
  return (
    <Card pad={0} gap={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
      {items.map(([label, to], i) => (
        <Tap key={to} label={label} href={to} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
          <Txt size={13.5} w={600}>
            {label}
          </Txt>
          <Icon d={I.up} size={14} sw={2} style={{ transform: 'rotate(90deg)' }} />
        </Tap>
      ))}
    </Card>
  );
}
