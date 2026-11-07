'use client';
/** Notifications from the server (C12): likes, comments, mentions, follows, invites, events, trees, badges, goals, heat, farm, verification. Guests get none. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppNotification } from '../types';
import { useDataContext } from './context';
import { getJSON, request, shouldRetry } from './http';
import { API } from './heat';
import { qk } from './keys';

type Page = { items: AppNotification[]; unread: number };

function useNotificationPage() {
  const ctx = useDataContext();
  return useQuery<Page>({
    queryKey: qk.notifications(ctx.ns),
    enabled: ctx.ready && !ctx.offline,
    retry: shouldRetry,
    refetchInterval: 60_000,
    queryFn: ({ signal }) => (ctx.kind === 'guest' ? Promise.resolve({ items: [], unread: 0 }) : getJSON<Page>(`${API}/notifications`, {}, signal)),
  });
}

export function useNotifications() {
  const q = useNotificationPage();
  return { ...q, data: q.data?.items } as Omit<typeof q, 'data'> & { data: AppNotification[] | undefined };
}

/** Unread count for the bell badge. */
export function useUnreadCount() {
  const q = useNotificationPage();
  return { ...q, data: q.data?.unread } as Omit<typeof q, 'data'> & { data: number | undefined };
}

/** Mark ids as read; pass 'all' for everything. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  const ctx = useDataContext();
  return useMutation<void, Error, string[] | 'all'>({
    mutationFn: async (ids) => {
      await request(`${API}/notifications/read`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ids === 'all' ? {} : { ids }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notifications(ctx.ns) }),
  });
}
