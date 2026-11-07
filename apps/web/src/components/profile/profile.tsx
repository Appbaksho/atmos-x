'use client';
/** S20 · Profile (tab root): level, points (provisional separately), badges, clans, contribution map, sensors, My trees, history. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  Avatar,
  B,
  Bar,
  Card,
  CzButton,
  ErrorState,
  GhostButton,
  HScroll,
  I,
  Icon,
  IconBtn,
  ListRow,
  Photo,
  R,
  Screen,
  SectionTitle,
  Skeleton,
  SkeletonCard,
  SourceChips,
  Tap,
  Txt,
  View,
  href,
  useCz,
  goBack,
} from '@/components/cz';
import { teamInitials } from '@/components/community/shared';
import { useActions, useMe, useMyStats, useOrg, usePartnerMe, useProfile, useSensors, useSession, useTeams, useUnreadCount } from '@/lib/data/hooks';
import type { ActionLog, Badge, Team } from '@/lib/data/types';
import { initials } from '@/lib/format';

import { useCodeText } from './codes';
import { AvatarEditor } from './avatar-editor';
import { MyTrees } from './my-trees';

/** Prototype gear (the settings button on S20). */
export const GEAR =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.5 7.5 0 0 1-1.9 1.1L15 20.5h-4l-.3-2a7.5 7.5 0 0 1-1.9-1.1l-1.9.7-2-3.4 1.6-1.2a7.6 7.6 0 0 1 0-2.9L3 9.4l2-3.4 1.9.7a7.5 7.5 0 0 1 1.9-1.1L9 3.5h4l.3 2.1a7.5 7.5 0 0 1 1.9 1.1l1.9-.7 2 3.4-1.6 1.2a7.6 7.6 0 0 1 0 2.9z';

/** Unsplash basemap (Mahmud Ahsan), credited on About. */
const BASEMAP = 'https://images.unsplash.com/photo-1592396131156-0d1a9c1f6869?auto=format&fit=crop&w=800&h=400&q=70&crop=focalpoint&fp-x=.4&fp-y=.5&fp-z=1.4';

const BADGE_ICON: Record<string, string> = {
  first: I.sparkleOne,
  trees10: I.tree,
  trees100: I.tree,
  clan: I.community,
  p1000: I.sun,
  streak: I.trend,
};

const ACTION_ICON: Record<string, string> = {
  plant_tree: I.tree,
  plant_shrubs: I.tree,
  rooftop_garden: I.roof,
  cool_roof: I.roof,
  green_wall: I.climber,
  shade_structure: I.sun,
  water_tree: I.drop,
  awareness: I.community,
};

export function ProfileScreen() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const { f } = useCz();
  const session = useSession();
  const unread = useUnreadCount();
  const n = unread.data ?? 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconBtn d={f.backPath} label={tc('back')} onPress={goBack} />
        <View style={{ flex: 1 }} />
        <IconBtn d={I.bell} iconSize={20} label={n ? t('notifsUnread', { n }) : t('notifs')} badge={n > 0} href={href('S21')} />
        <IconBtn d={GEAR} iconSize={20} label={t('links.settings')} href={href('S22')} />
      </View>
      <Identity />
      {!session.ready ? <SkeletonCard lines={3} height={180} /> : session.isGuest ? <GuestCard /> : <PointsCard />}
      {session.ready && !session.isGuest ? (
        <>
          <Badges />
          <Clans />
          <ContribMap />
          <Sensors />
        </>
      ) : null}
      <MyTrees />
      {session.ready && !session.isGuest ? <History /> : null}
      <Links />
    </Screen>
  );
}

/* ───────────────────────────── Identity ───────────────────────────── */

function Identity() {
  const t = useTranslations('profile');
  const { c, f } = useCz();
  const me = useMe();
  const session = useSession();
  const stats = useMyStats();
  const codes = useCodeText();
  const lvl = stats.data?.level;
  const prof = useProfile();
  const [editing, setEditing] = useState(false);
  const avatar = prof.data?.avatar_url ?? null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4 }}>
      <Tap
        label={session.isGuest ? t('yourPhoto') : t('avatar.change')}
        onPress={session.isGuest ? undefined : () => setEditing(true)}
        disabled={session.isGuest}
        style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: B.lime, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {avatar && !session.isGuest ? (
          // eslint-disable-next-line @next/next/no-img-element -- moderated media URL
          <img src={avatar} alt="" width={84} height={84} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : session.isGuest || !me.display_name ? (
          <Icon d={I.profile} size={38} color={c.ink2} sw={1.5} />
        ) : (
          <Txt size={28} w={600} color={c.ink}>
            {initials(me.display_name)}
          </Txt>
        )}
      </Tap>
      {!session.isGuest ? <AvatarEditor open={editing} onClose={() => setEditing(false)} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Txt display size={20} as="h1">
          {session.isGuest ? t('guestName') : me.display_name}
        </Txt>
        {!session.ready || (stats.isPending && !session.isGuest) ? (
          <Skeleton w={160} h={14} />
        ) : !session.isGuest && lvl ? (
          <Txt size={13} dim>
            {t('level', { n: f.loc(lvl.level), name: codes.level(lvl.name_code) })}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function GuestCard() {
  const t = useTranslations('profile');
  return (
    <Card tone="navy" gap={12} style={{ borderRadius: R.xxl }}>
      <Txt size={13.5} color="rgba(255,255,255,0.88)">
        {t('guestSub')}
      </Txt>
      <CzButton label={t('guestCta')} icon="check" href={href('register', undefined, { next: href('S20') })} />
      <GhostButton label={t('guestSignIn')} href={href('login', undefined, { next: href('S20') })} height={46} color={B.white} />
    </Card>
  );
}

/* ───────────────────────────── Points ───────────────────────────── */

function PointsCard() {
  const t = useTranslations('profile');
  const { c, f } = useCz();
  const stats = useMyStats();

  if (stats.isPending) return <SkeletonCard lines={3} height={180} />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  const s = stats.data;
  const lvl = s.level;
  const earned = s.points.earned;
  const pct = lvl.next ? ((earned - lvl.min) / Math.max(1, lvl.next - lvl.min)) * 100 : 100;
  const tiles: [string, string][] = [
    [s.rank_area ? `#${f.loc(s.rank_area.rank)}` : '–', t('statRank')],
    [`${f.loc(s.trees_alive)}/${f.loc(s.trees)}`, t('statTrees')],
    [f.loc(s.actions), t('statActions')],
  ];

  return (
    <View style={{ backgroundColor: B.navy, borderRadius: R.xxl, padding: 18, gap: 12, borderWidth: c.dark ? 1 : 0, borderColor: c.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ gap: 2 }}>
          <Txt size={12} color="rgba(255,255,255,0.8)">
            {t('points')}
          </Txt>
          <Txt size={40} num color={B.white} style={{ lineHeight: '44px', letterSpacing: -0.8 }}>
            {f.num(earned)}
          </Txt>
        </View>
        <Txt size={12} w={600} color={B.lime} style={{ textAlign: 'end' }}>
          {lvl.next ? t('toNext', { pts: f.num(lvl.next - earned), n: f.loc(lvl.level + 1) }) : t('maxLevel')}
        </Txt>
      </View>
      <Bar pct={pct} height={10} color={B.lime} track="rgba(255,255,255,0.14)" label={t('points')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon d={I.check} size={14} sw={2.4} color={B.lime} />
        <Txt size={12} w={600} color={B.white}>
          {t('spendable', { pts: f.num(s.points.spendable) })}
        </Txt>
      </View>
      {s.points.pending > 0 ? (
        <View role="note" label={t('pendingA11y', { pts: f.num(s.points.pending) })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon d={I.clock} size={14} sw={2} color={B.orange} />
          <Txt size={12} w={600} color={B.orange} style={{ flex: 1 }}>
            {s.points.next_unlock_at
              ? t('pendingUntil', { pts: f.num(s.points.pending), date: f.date(s.points.next_unlock_at, { day: 'numeric', month: 'short' }) })
              : t('pending', { pts: f.num(s.points.pending) })}
          </Txt>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
        {tiles.map(([val, label]) => (
          <View key={label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={18} w={600} num color={B.white} lines={1}>
              {val}
            </Txt>
            <Txt size={11} color="rgba(255,255,255,0.75)" lines={1}>
              {label}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ───────────────────────────── Badges ───────────────────────────── */

function Badges() {
  const t = useTranslations('profile');
  const stats = useMyStats();
  const badges = stats.data?.badges ?? [];
  if (!badges.length) return null;
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t('badges')} />
      <HScroll label={t('badges')} style={{ paddingBottom: 4 }}>
        {sorted.map((b) => (
          <BadgeHex key={b.id} b={b} />
        ))}
      </HScroll>
    </View>
  );
}

function BadgeHex({ b }: { b: Badge }) {
  const t = useTranslations('profile');
  const { c } = useCz();
  const codes = useCodeText();
  const name = codes.badge(b.code);
  return (
    <View role="img" label={t('badgeA11y', { name, state: b.earned ? t('earned') : t('locked') })} style={{ width: 92, alignItems: 'center', gap: 6, opacity: b.earned ? 1 : 0.45 }}>
      <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
        <svg width={64} height={64} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <polygon points="32,0 59.5,16 59.5,48 32,64 4.5,48 4.5,16" fill={b.earned ? B.lime : c.soft} />
        </svg>
        <View>
          <Icon d={BADGE_ICON[b.id] ?? I.sparkleOne} size={26} color={b.earned ? B.limeInk : c.ink2} sw={1.8} />
        </View>
      </View>
      <Txt size={11.5} w={600} center style={{ lineHeight: '14px' }}>
        {name}
      </Txt>
    </View>
  );
}

/* ───────────────────────────── Clans ───────────────────────────── */

function Clans() {
  const teams = useTeams();
  const list = teams.data ?? [];
  if (!list.length) return null;
  const orgIds = [...new Set(list.map((x) => x.org_id).filter((x): x is string => !!x))];
  return (
    <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
      {list.map((tm, i) => (
        <ClanTeamRow key={tm.id} team={tm} last={i === list.length - 1 && !orgIds.length} />
      ))}
      {orgIds.map((id, i) => (
        <ClanOrgRow key={id} id={id} last={i === orgIds.length - 1} />
      ))}
    </Card>
  );
}

function ClanTeamRow({ team, last }: { team: Team; last: boolean }) {
  const t = useTranslations('profile');
  const tc = useTranslations('community');
  const { c, f } = useCz();
  const me = useMe();
  const role = team.members.find((m) => m.user_id === me.id)?.role ?? 'member';
  return (
    <ListRow last={last} label={team.name} href={href('S17', { id: team.id })}>
      <Avatar ini={teamInitials(team.name)} bg={B.lime} fg={B.limeInk} size={40} square />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={14} w={600} lines={1}>
          {team.name}
        </Txt>
        <Txt size={11.5} dim>
          {`${t('clanTeam', { role: tc(`role.${role}`) })} · ${f.num(team.stats.points)} ${tc('points')}`}
        </Txt>
      </View>
      <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
    </ListRow>
  );
}

function ClanOrgRow({ id, last }: { id: string; last: boolean }) {
  const t = useTranslations('profile');
  const { c, f } = useCz();
  const org = useOrg(id);
  if (!org.data) return null;
  return (
    <ListRow last={last} label={org.data.name} href={href('S18', { id })}>
      <Avatar ini={teamInitials(org.data.name)} bg={B.blue} fg={B.white} size={40} square />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={14} w={600} lines={1}>
          {org.data.name}
        </Txt>
        <Txt size={11.5} dim>
          {t('clanOrg')}
        </Txt>
      </View>
      <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
    </ListRow>
  );
}

/* ───────────────────────────── Contribution map ───────────────────────────── */

const hexPts = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 30);
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

/** Where the user contributed, snapped to ~150 m cells and fitted into the card (relative positions are real). */
function ContribMap() {
  const t = useTranslations('profile');
  const actions = useActions();
  const pts = snapped(actions.data ?? []);
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const W = 346;
  const H = 170;
  const pad = 46;
  const sx = (lng: number) => (maxLng === minLng ? W / 2 : pad + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * pad));
  const sy = (lat: number) => (maxLat === minLat ? H / 2 : pad / 1.6 + ((maxLat - lat) / (maxLat - minLat)) * (H - (2 * pad) / 1.6));
  return (
    <Card pad={12} gap={10}>
      <Txt label style={{ paddingHorizontal: 4, paddingTop: 4 }}>
        {t('myMap')}
      </Txt>
      <Photo src={BASEMAP} label={t('mapA11y')} style={{ height: 170, borderRadius: 18 }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ position: 'absolute', inset: 0, direction: 'ltr' }}>
          {pts.map((p) => (
            <polygon key={`h${p.key}`} points={hexPts(sx(p.lng), sy(p.lat), 24)} fill={B.lime} fillOpacity={0.35} stroke={B.lime} strokeWidth={1.5} />
          ))}
          {pts.map((p) => (
            <circle key={`c${p.key}`} cx={sx(p.lng)} cy={sy(p.lat)} r={5} fill={B.lime} stroke={B.navy} strokeWidth={2} />
          ))}
        </svg>
      </Photo>
      <Txt size={11.5} dim style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
        {t('snapNote')}
      </Txt>
    </Card>
  );
}

function snapped(actions: ActionLog[]) {
  const m = new Map<string, { key: string; lat: number; lng: number }>();
  for (const a of actions) {
    if (a.lat == null || a.lng == null || a.status === 'rejected') continue;
    const lat = Math.round(a.lat / 0.0015) * 0.0015;
    const lng = Math.round(a.lng / 0.0015) * 0.0015;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (!m.has(key)) m.set(key, { key, lat, lng });
  }
  return [...m.values()].slice(0, 12);
}

/* ───────────────────────────── Sensors ───────────────────────────── */

function Sensors() {
  const t = useTranslations('profile');
  const { c, f } = useCz();
  const sensors = useSensors();
  const n = sensors.data?.length ?? 0;
  return (
    <Tap label={t('sensors')} href={n ? href('S27') : href('S28')} style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, textAlign: 'start' }}>
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={I.device} size={22} sw={1.7} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={14} w={600}>
          {t('sensors')}
        </Txt>
        <Txt size={12} dim>
          {t('sensorsSub', { count: n, n: f.loc(n) })}
        </Txt>
      </View>
      <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
    </Tap>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

function History() {
  const t = useTranslations('profile');
  const { c, f } = useCz();
  const actions = useActions();
  const codes = useCodeText();
  if (actions.isPending) return <SkeletonCard lines={4} />;
  if (actions.isError) return <ErrorState error={actions.error} onRetry={() => void actions.refetch()} compact />;
  const list = [...(actions.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t('history')} />
      {!list.length ? (
        <Card gap={10}>
          <Txt size={13} dim>
            {t('historyEmpty')}
          </Txt>
          <CzButton label={t('logAction')} icon="camera" size="md" href={href('S14')} />
        </Card>
      ) : (
        <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          {list.map((a, i) => {
            const pending = a.status === 'pending';
            const title = `${codes.action(a.action_type)} × ${f.loc(a.quantity)}`;
            const where = [a.zone_label, t(`status.${a.status}`)].filter(Boolean).join(' · ');
            return (
              <ListRow key={a.id} last={i === list.length - 1} label={title} href={href('S15', { id: a.id })}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={ACTION_ICON[a.action_type] ?? I.tree} size={18} sw={1.7} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Txt size={13.5} w={600} lines={1}>
                    {title}
                  </Txt>
                  <Txt size={11.5} dim lines={1}>
                    {t('historyMeta', { date: f.date(a.created_at, { day: 'numeric', month: 'short' }), where })}
                  </Txt>
                </View>
                <Txt size={12.5} w={600} num color={pending ? B.orangeInk : a.status === 'rejected' ? c.ink2 : c.leaf}>
                  {a.status === 'rejected' ? '0' : `+${f.num(a.points)}`}
                </Txt>
              </ListRow>
            );
          })}
        </Card>
      )}
      <SourceChips sources={[{ id: 'device', name: 'This device' }]} />
    </View>
  );
}

/* ───────────────────────────── Links ───────────────────────────── */

function Links() {
  const t = useTranslations('profile.links');
  const { c, f } = useCz();
  const session = useSession();
  const partner = usePartnerMe();
  const rows: { label: string; to: string; icon: string }[] = [
    { label: t('store'), to: href('store'), icon: I.sparkleOne },
    { label: t('orders'), to: href('store', undefined, { tab: 'orders' }), icon: I.clock },
    ...(partner.data ? [{ label: t('partner'), to: href('partner'), icon: I.check }] : []),
    { label: t('company'), to: href('company'), icon: I.trend },
    ...(session.role === 'admin' ? [{ label: t('admin'), to: href('admin'), icon: I.lock }] : []),
    { label: t('notifs'), to: href('S21'), icon: I.bell },
    { label: t('settings'), to: href('S22'), icon: GEAR },
    { label: t('about'), to: href('about'), icon: I.sat },
  ];
  return (
    <View style={{ gap: 8 }}>
      <Txt label as="h2" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
        {t('title')}
      </Txt>
      <Card pad={0} gap={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
        {rows.map((l, i) => (
          <ListRow key={l.to} label={l.label} last={i === rows.length - 1} href={l.to}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={l.icon} size={18} sw={1.7} />
            </View>
            <Txt size={13.5} w={500} style={{ flex: 1, minWidth: 0 }}>
              {l.label}
            </Txt>
            <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
          </ListRow>
        ))}
      </Card>
    </View>
  );
}

