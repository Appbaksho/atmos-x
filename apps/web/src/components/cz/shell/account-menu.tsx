'use client';
/**
 * N2 · The header avatar menu on phones and tablets (< 1024 px). The five tabs carry the main
 * screens; Profile, Store, Farm and the rest live here. Desktop has them in the sidebar instead.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useMe, usePartnerMe, useSession, useUnreadCount } from '@/lib/data/hooks';
import { initials } from '@/lib/format';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { requireAccount } from '../account';
import { I } from '../icons';
import { BottomSheet } from '../sheet';
import { B, R } from '../tokens';
import { Avatar, CzButton, Icon, Tap, Txt, View } from '../ui';

export type MenuItem = { key: string; label: string; to: string; icon: string; badge?: number };

/** Everything that is not one of the five phone tabs, in sidebar order (N1). */
export function useMoreItems(): MenuItem[] {
  const t = useTranslations('nav');
  const session = useSession();
  const partner = usePartnerMe();
  const unread = useUnreadCount();
  const { prefs } = useCz();
  const mod = session.role === 'moderator' || session.role === 'admin';
  return [
    { key: 'profile', label: t('profile'), to: href('S20'), icon: I.profile },
    { key: 'store', label: t('store'), to: href('store'), icon: I.sparkleOne },
    prefs.farmer_mode ? { key: 'map', label: t('map'), to: href('S05'), icon: I.map } : { key: 'farm', label: t('farm'), to: href('F03'), icon: I.drop },
    { key: 'air', label: t('air'), to: href('S26'), icon: I.wind },
    { key: 'notifications', label: t('notifications'), to: href('S21'), icon: I.bell, badge: unread.data ?? 0 },
    { key: 'settings', label: t('settings'), to: href('S22'), icon: I.settings },
    { key: 'about', label: t('about'), to: href('about'), icon: I.info },
    ...(partner.data ? [{ key: 'partner', label: t('partner'), to: href('partner'), icon: I.check }] : []),
    { key: 'company', label: t('company'), to: href('company'), icon: I.trend },
    ...(mod ? [{ key: 'moderation', label: t('moderation'), to: href('moderation'), icon: I.warn }] : []),
    ...(session.role === 'admin' ? [{ key: 'admin', label: t('admin'), to: href('admin'), icon: I.lock }] : []),
  ];
}

/** The round avatar that opens the menu. Hidden at ≥ 1024 px (the sidebar has everything). */
export function AccountMenuButton({ tone = 'card' }: { tone?: 'card' | 'glass' }) {
  const t = useTranslations('nav');
  const { c, f } = useCz();
  const me = useMe();
  const session = useSession();
  const unread = useUnreadCount();
  const items = useMoreItems();
  const [open, setOpen] = useState(false);
  const glass = tone === 'glass';
  const n = unread.data ?? 0;
  const ini = session.isGuest ? '?' : initials(me.display_name);
  const src = session.isGuest ? null : me.avatar_url;
  return (
    <>
      <Tap
        label={n ? t('menuUnread', { n: f.loc(n) }) : t('menu')}
        haptic
        onPress={() => setOpen(true)}
        className="lg:hidden"
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', backgroundColor: glass ? B.glass : c.card, borderWidth: glass ? 1 : 0, borderColor: B.glassLine }}>
        <Avatar ini={ini} bg={B.navy} fg={B.lime} size={34} src={src} />
        {n ? <span aria-hidden style={{ position: 'absolute', top: 4, insetInlineEnd: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: B.red, border: `2px solid ${glass ? B.navy : c.card}` }} /> : null}
      </Tap>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={session.isGuest ? t('guest') : me.display_name}
        sub={session.isGuest ? t('guestSub') : (me.email ?? undefined)}
        leading={<Avatar ini={ini} bg={B.navy} fg={B.lime} size={44} src={src} />}>
        <View style={{ gap: 12 }}>
          {session.isGuest ? (
            <CzButton
              label={t('signUp')}
              size="md"
              onPress={() => {
                setOpen(false);
                requireAccount(null);
              }}
            />
          ) : null}
          <View role="list" style={{ backgroundColor: c.soft, borderRadius: R.xl, paddingVertical: 4, paddingHorizontal: 12 }}>
            {items.map((m, i) => (
              <View role="listitem" key={m.key}>
                <Tap
                  role="link"
                  label={m.badge ? `${m.label} (${f.loc(m.badge)})` : m.label}
                  href={m.to}
                  onPress={() => setOpen(false)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, textAlign: 'start' }}>
                  <Icon d={m.icon} size={19} sw={1.7} color={c.ink2} />
                  <Txt size={14} w={500} style={{ flex: 1, minWidth: 0 }} lines={1}>
                    {m.label}
                  </Txt>
                  {m.badge ? (
                    <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: B.red, alignItems: 'center', justifyContent: 'center' }}>
                      <Txt size={11} w={700} color={B.white} num>
                        {f.loc(m.badge)}
                      </Txt>
                    </View>
                  ) : null}
                </Tap>
              </View>
            ))}
          </View>
        </View>
      </BottomSheet>
    </>
  );
}
