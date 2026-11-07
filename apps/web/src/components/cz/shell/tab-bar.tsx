'use client';
/**
 * Navigation (prompt-v1 §6.3):
 * - N1 sidebar at ≥ 1024 px: Home, Map, Plan, My trees, Community, Store, Farm; then Air quality,
 *   Notifications, Settings, About; the profile at the bottom.
 * - N2 floating pill tab bar below 1024 px: Home, Map, Plan, My trees, Community. Store, Profile
 *   and the rest are in the header avatar menu (account-menu.tsx). Farmer mode swaps Map for Farm.
 * - N3 "+ Log action" in the sidebar and at the end of the tab bar.
 */
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/navigation';
import { useMe, usePartnerMe, useSession, useUnreadCount } from '@/lib/data/hooks';
import { initials } from '@/lib/format';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { I } from '../icons';
import { B, SHADOW } from '../tokens';
import { Avatar, Icon, Tap, Txt, View } from '../ui';

type Key = 'home' | 'map' | 'farm' | 'plan' | 'trees' | 'community' | 'store';
type Tab = { key: Key; path: string; icon: string; match: (p: string) => boolean };

const T: Record<Key, Tab> = {
  home: { key: 'home', path: href('S04'), icon: I.home, match: (p) => p === '/app' },
  map: { key: 'map', path: href('S05'), icon: I.map, match: (p) => p === '/app/map' || p.startsWith('/app/zone') },
  farm: { key: 'farm', path: href('F03'), icon: I.drop, match: (p) => p.startsWith('/app/farm') },
  plan: { key: 'plan', path: href('S10'), icon: I.plan, match: (p) => p === '/app/plan' || p.startsWith('/app/goal') || p.startsWith('/app/species') || p === '/app/budget' || p === '/app/nurseries' },
  trees: { key: 'trees', path: href('trees'), icon: I.tree, match: (p) => p.startsWith('/app/tree') },
  community: {
    key: 'community',
    path: href('S16'),
    icon: I.community,
    match: (p) => p === '/app/community' || p.startsWith('/app/team') || p.startsWith('/app/org') || p.startsWith('/app/event') || p.startsWith('/app/post') || p.startsWith('/app/u/'),
  },
  store: { key: 'store', path: href('store'), icon: I.sparkleOne, match: (p) => p.startsWith('/app/store') },
};

/** Phone tabs (N2). Farmer mode puts Farm where Map is. */
function phoneTabs(farmer: boolean): Tab[] {
  return [T.home, farmer ? T.farm : T.map, T.plan, T.trees, T.community];
}

/** Tab roots: the floating bar shows here; stacked screens have no tab bar (as on mobile). */
export const TAB_ROOT_PATHS: ReadonlySet<string> = new Set(['/app', '/app/map', '/app/plan', '/app/tree', '/app/community']);

export function isTabRoot(path: string, farmer: boolean) {
  return TAB_ROOT_PATHS.has(path) || (farmer && path === '/app/farm/fields');
}

/** Floating pill tab bar (phones and tablets). Tabs size to their labels so long words still fit at 360 px. */
export function TabBar() {
  const { c, prefs } = useCz();
  const path = usePathname();
  const t = useTranslations('nav');
  if (!isTabRoot(path, prefs.farmer_mode)) return null;
  return (
    <nav
      aria-label={t('main')}
      className="cz-tabbar flex lg:hidden"
      style={{
        position: 'fixed',
        insetInline: 10,
        bottom: 'calc(22px + max(0px, env(safe-area-inset-bottom, 0px) - 12px))',
        height: 66,
        borderRadius: 26,
        backgroundColor: c.card,
        border: `1px solid ${c.line}`,
        flexDirection: 'row',
        alignItems: 'center',
        paddingInline: 4,
        zIndex: 60,
        maxWidth: 560,
        marginInline: 'auto',
        ...SHADOW.card,
      }}>
      {phoneTabs(prefs.farmer_mode).map((tab) => {
        const on = tab.match(path);
        const l = t(tab.key === 'trees' ? 'treesTab' : tab.key);
        return (
          <Tap key={tab.key} role="link" selected={on} label={t(tab.key)} haptic href={tab.path} style={{ flex: '1 1 auto', minWidth: 0, height: 56, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <View style={{ width: 44, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.lime : 'transparent' }}>
              <Icon d={tab.icon} size={20} sw={1.7} color={on ? B.limeInk : c.ink2} />
            </View>
            <Txt size={10} w={on ? 600 : 500} color={on ? c.ink : c.ink2} lines={1} style={{ maxWidth: '100%', letterSpacing: -0.15 }}>
              {l}
            </Txt>
          </Tap>
        );
      })}
      <Tap role="link" label={t('logAction')} haptic href={href('S14')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginInline: 4 }}>
        <Icon d={I.plus} size={22} sw={2.4} color={B.limeInk} />
      </Tap>
    </nav>
  );
}

const MORE = [
  { key: 'air', path: href('S26'), icon: I.wind, match: (p: string) => p.startsWith('/app/air') },
  { key: 'notifications', path: href('S21'), icon: I.bell, match: (p: string) => p === '/app/notifications' },
  { key: 'settings', path: href('S22'), icon: I.settings, match: (p: string) => p === '/app/settings' },
  { key: 'about', path: href('about'), icon: I.info, match: (p: string) => p === '/app/about' },
] as const;

/** Left sidebar (≥ 1024 px). */
export function Sidebar() {
  const { c } = useCz();
  const path = usePathname();
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const me = useMe();
  const session = useSession();
  const partner = usePartnerMe();
  const unread = useUnreadCount();
  const n = unread.data ?? 0;
  const mod = session.role === 'moderator' || session.role === 'admin';

  const item = (key: string, to: string, icon: string, on: boolean, text: string, dot = false) => (
    <Tap
      key={key}
      role="link"
      selected={on}
      label={text}
      href={to}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, flexShrink: 0, paddingHorizontal: 8, borderRadius: 16, backgroundColor: on ? c.soft : 'transparent' }}>
      <View style={{ width: 44, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.lime : 'transparent' }}>
        <Icon d={icon} size={20} sw={1.7} color={on ? B.limeInk : c.ink2} />
      </View>
      <Txt size={14} w={on ? 600 : 500} color={on ? c.ink : c.ink2} lines={1} style={{ flex: 1, minWidth: 0 }}>
        {text}
      </Txt>
      {dot ? <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: B.red }} /> : null}
    </Tap>
  );

  const main = [T.home, T.map, T.plan, T.trees, T.community, T.store, T.farm];
  const extra = [
    ...(partner.data ? [{ key: 'partner', path: href('partner'), icon: I.check }] : []),
    { key: 'company', path: href('company'), icon: I.trend },
    ...(mod ? [{ key: 'moderation', path: href('moderation'), icon: I.warn }] : []),
    ...(session.role === 'admin' ? [{ key: 'admin', path: href('admin'), icon: I.lock }] : []),
  ];
  const onProfile = path === '/app/profile';

  return (
    <nav
      aria-label={t('main')}
      className="cz-sidebar hidden lg:flex"
      style={{ position: 'fixed', insetBlock: 0, insetInlineStart: 0, width: 248, flexDirection: 'column', gap: 2, padding: 16, backgroundColor: c.card, borderInlineEnd: `1px solid ${c.line}`, zIndex: 60, overflowY: 'auto' }}>
      <Tap href={href('S04')} label={tc('appName')} style={{ height: 64, flexShrink: 0, borderRadius: 20, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/atmosx-logo.png" alt={tc('appName')} width={150} height={42} style={{ width: 150, height: 'auto' }} />
      </Tap>
      <Tap role="link" label={t('logAction')} href={href('S14')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, flexShrink: 0, borderRadius: 16, backgroundColor: B.lime, marginBottom: 8 }}>
        <Icon d={I.plus} size={18} sw={2.4} color={B.limeInk} />
        <Txt size={14} w={600} color={B.limeInk}>
          {t('logAction')}
        </Txt>
      </Tap>
      {main.map((tab) => item(tab.key, tab.path, tab.icon, tab.match(path), t(tab.key)))}
      <div style={{ height: 1, flexShrink: 0, backgroundColor: c.line, marginBlock: 8 }} />
      {MORE.map((m) => item(m.key, m.path, m.icon, m.match(path), t(m.key), m.key === 'notifications' && n > 0))}
      {extra.map((m) => item(m.key, m.path, m.icon, path.startsWith(m.path), t(m.key)))}
      <View style={{ flex: 1, minHeight: 12 }} />
      <Tap
        role="link"
        selected={onProfile}
        label={t('profile')}
        href={href('S20')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, flexShrink: 0, paddingHorizontal: 8, borderRadius: 16, backgroundColor: onProfile ? c.soft : 'transparent' }}>
        <Avatar ini={session.isGuest ? '?' : initials(me.display_name)} bg={B.navy} fg={B.lime} size={36} src={session.isGuest ? null : me.avatar_url} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={13.5} w={600} lines={1}>
            {session.isGuest ? t('guest') : me.display_name}
          </Txt>
          <Txt size={11.5} dim lines={1}>
            {t('profile')}
          </Txt>
        </View>
      </Tap>
    </nav>
  );
}
