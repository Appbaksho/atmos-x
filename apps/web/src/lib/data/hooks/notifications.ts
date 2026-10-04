'use client';
/** Notifications: stored + derived (tree photo due). Guests get none (§4.5). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { currentContext } from '../local/context';
import { listNotifications, markNotificationsRead } from '../local/notifications';
import { listTrees } from '../local/trees';
import type { AppNotification } from '../types';
import { useDataContext } from './context';
import { qk } from './keys';

const fetchNotifications = async () => {
  const ctx = await currentContext();
  return listNotifications(ctx, ctx.kind === 'guest' ? [] : await listTrees(ctx.ns));
};

export function useNotifications() {
  const ctx = useDataContext();
  return useQuery<AppNotification[]>({
    queryKey: qk.notifications(ctx.ns),
    enabled: ctx.ready,
    queryFn: fetchNotifications,
  });
}

/** Unread count for the bell badge. */
export function useUnreadCount() {
  const ctx = useDataContext();
  return useQuery<AppNotification[], Error, number>({
    queryKey: qk.notifications(ctx.ns),
    enabled: ctx.ready,
    queryFn: fetchNotifications,
    select: (l) => l.filter((n) => !n.read).length,
  });
}

/** Mark ids as read; pass 'all' for everything currently listed. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string[] | 'all'>({
    mutationFn: async (ids) => {
      const c = await currentContext();
      const list = ids === 'all' ? (await fetchNotifications()).map((n) => n.id) : ids;
      await markNotificationsRead(c, list);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notifications(ctx.ns) }),
  });
}
