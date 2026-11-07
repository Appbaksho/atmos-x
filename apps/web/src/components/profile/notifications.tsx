'use client';
/** S21 · Notifications: filters, Today / Earlier groups, unread state, per-item action (marks it read). */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  B,
  EmptyState,
  ErrorState,
  FilterChip,
  HScroll,
  I,
  Icon,
  R,
  Screen,
  ScreenHeader,
  SkeletonCard,
  Tap,
  Txt,
  View,
  goPath,
  href,
  requireAccount,
  useCz,
} from '@/components/cz';
import { useMarkNotificationsRead, useNotifications, useSession } from '@/lib/data/hooks';
import type { AppNotification, NotificationKind } from '@/lib/data/types';

import { useCodeText } from './codes';

type Filter = 'all' | 'reminders' | 'results' | 'invites' | 'alerts';
const FILTERS: Filter[] = ['all', 'reminders', 'results', 'invites', 'alerts'];
const CAT: Record<NotificationKind, Filter> = {
  tree_due: 'reminders',
  tree_milestone: 'results',
  tree_helper: 'invites',
  event: 'reminders',
  verification: 'results',
  badge: 'results',
  goal_progress: 'results',
  team_invite: 'invites',
  like: 'invites',
  comment: 'invites',
  mention: 'invites',
  follow: 'invites',
  heat_warning: 'alerts',
  farm_alert: 'alerts',
};

/** Where a notification leads, and the label of its action pill. */
function target(n: AppNotification): { to: string; label: 'takePhoto' | 'seeDetails' | 'openPlan' | 'openHome' | 'openTeam' | 'open' } | null {
  const p = n.params ?? {};
  switch (n.kind) {
    case 'tree_due':
      return p.tree_id ? { to: href('tree', { id: p.tree_id }, { check: 1 }), label: 'takePhoto' } : { to: href('trees'), label: 'open' };
    case 'tree_milestone':
    case 'tree_helper':
      return p.tree_id ? { to: href('tree', { id: p.tree_id }), label: 'open' } : { to: href('trees'), label: 'open' };
    case 'badge':
      return { to: href('S20'), label: 'open' };
    case 'like':
    case 'comment':
    case 'mention':
      return p.post_id ? { to: href('post', { id: p.post_id }), label: 'open' } : { to: href('S16'), label: 'open' };
    case 'follow':
      return p.user_id ? { to: href('user', { id: p.user_id }), label: 'open' } : null;
    case 'event':
      return p.event_id ? { to: href('event', { id: p.event_id }), label: 'open' } : { to: href('events'), label: 'open' };
    case 'verification':
      if (p.redemption_id || p.order_id) return { to: href('store', undefined, { tab: 'orders' }), label: 'open' };
      return p.id ? { to: href('S15', { id: p.id }), label: 'seeDetails' } : null;
    case 'goal_progress':
      return { to: href('S10'), label: 'openPlan' };
    case 'heat_warning':
      return { to: href('S04'), label: 'openHome' };
    case 'team_invite':
      return p.id ? { to: href('S17', { id: p.id }), label: 'openTeam' } : { to: href('S16'), label: 'open' };
    case 'farm_alert':
      return p.alert_id ? { to: href('F02', { id: p.alert_id }, p.field_id ? { field: p.field_id } : undefined), label: 'open' } : { to: href('F03'), label: 'open' };
    default:
      return n.screen ? { to: href(n.screen, p), label: 'open' } : null;
  }
}

function looks(kind: NotificationKind, verified: boolean, c: { soft: string; ink: string }): { icon: string; bg: string; fg: string } {
  switch (kind) {
    case 'heat_warning':
      return { icon: I.sun, bg: B.red, fg: B.white };
    case 'farm_alert':
      return { icon: I.warn, bg: B.orange, fg: B.navy };
    case 'tree_due':
      return { icon: I.camera, bg: B.navy, fg: B.lime };
    case 'verification':
      return verified ? { icon: I.check, bg: B.lime, fg: B.limeInk } : { icon: I.clock, bg: 'rgba(242,154,56,0.25)', fg: c.ink };
    case 'goal_progress':
      return { icon: I.target, bg: B.blue, fg: B.white };
    case 'team_invite':
    case 'follow':
    case 'mention':
      return { icon: I.community, bg: B.navy, fg: B.lime };
    case 'like':
    case 'comment':
      return { icon: I.sparkleOne, bg: B.lime, fg: B.limeInk };
    case 'badge':
    case 'tree_milestone':
      return { icon: I.sparkle, bg: B.lime, fg: B.limeInk };
    case 'event':
      return { icon: I.clock, bg: B.blue, fg: B.white };
    default:
      return { icon: I.bell, bg: c.soft, fg: c.ink };
  }
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function NotificationsScreen() {
  const t = useTranslations('profile.notif');
  const tp = useTranslations('profile');
  const { f } = useCz();
  const session = useSession();
  const list = useNotifications();
  const mark = useMarkNotificationsRead();
  const [filter, setFilter] = useState<Filter>('all');

  const all = list.data ?? [];
  const unread = all.filter((n) => !n.read).length;
  const vis = all.filter((n) => filter === 'all' || CAT[n.kind] === filter);
  const now = new Date();
  const groups = [
    { name: t('today'), items: vis.filter((n) => sameDay(new Date(n.created_at), now)) },
    { name: t('earlier'), items: vis.filter((n) => !sameDay(new Date(n.created_at), now)) },
  ].filter((g) => g.items.length);

  return (
    <Screen>
      <ScreenHeader
        title={t('title')}
        sub={session.isGuest ? undefined : unread ? t('unread', { n: f.loc(unread) }) : t('caught')}
        right={
          session.isGuest ? null : (
            <Tap
              label={t('readAll')}
              disabled={unread === 0 || mark.isPending}
              onPress={() => mark.mutate('all')}
              style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: R.pill, justifyContent: 'center', opacity: unread === 0 ? 0.5 : 1 }}>
              <NotifReadAllText label={t('readAll')} />
            </Tap>
          )
        }
      />

      {!session.ready || list.isPending ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : session.isGuest ? (
        <EmptyState icon={I.bell} title={t('empty')} sub={t('guestSub')} action={tp('guestCta')} onAction={() => requireAccount(t('feature'))} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !all.length ? (
        <EmptyState icon={I.bell} title={t('empty')} sub={t('emptySub')} />
      ) : (
        <>
          <HScroll label={t('title')}>
            {FILTERS.map((k) => (
              <FilterChip key={k} label={t(`filters.${k}`)} active={filter === k} onPress={() => setFilter(k)} />
            ))}
          </HScroll>
          {!groups.length ? (
            <Txt size={13} dim center style={{ paddingVertical: 24 }}>
              {t('filterEmpty')}
            </Txt>
          ) : (
            groups.map((g) => (
              <View key={g.name} style={{ gap: 8 }}>
                <Txt label as="h2" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
                  {g.name}
                </Txt>
                {g.items.map((n) => (
                  <NotifCard key={n.id} n={n} onOpen={() => (n.read ? undefined : mark.mutate([n.id]))} />
                ))}
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function NotifReadAllText({ label }: { label: string }) {
  const { c } = useCz();
  return (
    <Txt size={13} w={600} color={c.leaf}>
      {label}
    </Txt>
  );
}

function NotifCard({ n, onOpen }: { n: AppNotification; onOpen: () => void }) {
  const t = useTranslations('profile.notif');
  const { c, f } = useCz();
  const codes = useCodeText();
  const verified = n.title.code === 'notif.verification.verified';
  const lk = looks(n.kind, verified, c);
  const title = codes.text(n.title);
  const body = n.body ? codes.text(n.body) : '';
  const go = target(n);
  const when = sameDay(new Date(n.created_at), new Date()) ? f.time(n.created_at) : f.date(n.created_at, { day: 'numeric', month: 'short' });
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: lk.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={lk.icon} size={19} sw={1.8} color={lk.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View role="group" label={`${n.read ? '' : `${t('unreadA11y')} `}${title}. ${body} ${when}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Txt size={14} w={n.read ? 600 : 700} style={{ flex: 1, minWidth: 0 }}>
              {title}
            </Txt>
            <Txt size={11} dim num style={{ paddingTop: 2 }}>
              {when}
            </Txt>
          </View>
          {body ? (
            <Txt size={12.5} dim style={{ lineHeight: '18px' }}>
              {body}
            </Txt>
          ) : null}
        </View>
        {go ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
            <Tap
              label={t(go.label)}
              haptic
              onPress={() => {
                onOpen();
                goPath(go.to);
              }}
              style={{
                minHeight: 36,
                paddingHorizontal: 14,
                borderRadius: R.pill,
                borderWidth: n.read ? 1.5 : 0,
                borderColor: c.line,
                backgroundColor: n.read ? 'transparent' : B.lime,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Txt size={12.5} w={600} color={n.read ? c.ink : B.limeInk} lines={1}>
                {t(go.label)}
              </Txt>
            </Tap>
          </View>
        ) : null}
      </View>
      {!n.read ? <span aria-hidden style={{ position: 'absolute', top: 14, insetInlineStart: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: B.blue }} /> : null}
    </View>
  );
}
