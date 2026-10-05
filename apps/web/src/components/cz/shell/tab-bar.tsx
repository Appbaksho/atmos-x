'use client';
/**
 * Navigation: the prototype's floating pill tab bar (5 tabs, lime indicator, "Fields" label in
 * farmer mode) below 1024 px, and a left sidebar at ≥ 1024 px. Port of
 * apps/mobile/src/app/(tabs)/_layout.tsx.
 */
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/navigation';
import { useCz } from '@/lib/prefs';
import { href } from '@/lib/routes';

import { I } from '../icons';
import { B, SHADOW } from '../tokens';
import { Icon, Tap, Txt, View } from '../ui';

type Tab = { key: 'home' | 'map' | 'plan' | 'community' | 'profile'; path: string; icon: string; match: (p: string) => boolean };

const TABS: Tab[] = [
  { key: 'home', path: href('S04'), icon: I.home, match: (p) => p === '/app' },
  { key: 'map', path: href('S05'), icon: I.map, match: (p) => p === '/app/map' || p.startsWith('/app/zone') || p === '/app/farm/fields' },
  { key: 'plan', path: href('S10'), icon: I.plan, match: (p) => p === '/app/plan' || p.startsWith('/app/goal') || p.startsWith('/app/species') || p === '/app/budget' || p === '/app/nurseries' },
  { key: 'community', path: href('S16'), icon: I.community, match: (p) => p === '/app/community' || p.startsWith('/app/team') || p.startsWith('/app/org') },
  { key: 'profile', path: href('S20'), icon: I.profile, match: (p) => p === '/app/profile' || p.startsWith('/app/tree') || p === '/app/settings' || p === '/app/notifications' },
];

/** Tab roots where the floating bar is shown (stacked screens have no tab bar, as on mobile). */
const TAB_ROOTS = new Set(['/app', '/app/map', '/app/plan', '/app/community', '/app/profile']);

export function isTabRoot(path: string, farmer: boolean) {
  return TAB_ROOTS.has(path) || (farmer && path === '/app/farm/fields');
}

function useLabels() {
  const t = useTranslations('nav');
  const { prefs } = useCz();
  return (k: Tab['key']) => (k === 'map' && prefs.farmer_mode ? t('fields') : t(k));
}

/** Floating pill tab bar (mobile/tablet). */
export function TabBar() {
  const { c, prefs } = useCz();
  const path = usePathname();
  const label = useLabels();
  const t = useTranslations('nav');
  if (!isTabRoot(path, prefs.farmer_mode)) return null;
  return (
    <nav
      aria-label={t('main')}
      className="cz-tabbar flex lg:hidden"
      style={{
        position: 'fixed',
        insetInline: 12,
        bottom: 'calc(22px + max(0px, env(safe-area-inset-bottom, 0px) - 12px))',
        height: 66,
        borderRadius: 26,
        backgroundColor: c.card,
        border: `1px solid ${c.line}`,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingInline: 6,
        zIndex: 60,
        maxWidth: 560,
        marginInline: 'auto',
        ...SHADOW.card,
      }}>
      {TABS.map((tab) => {
        const on = tab.match(path);
        const l = label(tab.key);
        return (
          <Tap key={tab.key} role="link" selected={on} label={l} haptic href={tab.path} style={{ minWidth: 58, height: 56, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <View style={{ width: 44, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.lime : 'transparent' }}>
              <Icon d={tab.icon} size={20} sw={1.7} color={on ? B.limeInk : c.ink2} />
            </View>
            <Txt size={10.5} w={on ? 600 : 500} color={on ? c.ink : c.ink2} lines={1}>
              {l}
            </Txt>
          </Tap>
        );
      })}
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
  const label = useLabels();
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  const item = (key: string, to: string, icon: string, on: boolean, text: string) => (
    <Tap
      key={key}
      role="link"
      selected={on}
      label={text}
      href={to}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 8, borderRadius: 16, backgroundColor: on ? c.soft : 'transparent' }}>
      <View style={{ width: 44, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.lime : 'transparent' }}>
        <Icon d={icon} size={20} sw={1.7} color={on ? B.limeInk : c.ink2} />
      </View>
      <Txt size={14} w={on ? 600 : 500} color={on ? c.ink : c.ink2} lines={1}>
        {text}
      </Txt>
    </Tap>
  );

  return (
    <nav
      aria-label={t('main')}
      className="cz-sidebar hidden lg:flex"
      style={{ position: 'fixed', insetBlock: 0, insetInlineStart: 0, width: 248, flexDirection: 'column', gap: 4, padding: 16, backgroundColor: c.card, borderInlineEnd: `1px solid ${c.line}`, zIndex: 60, overflowY: 'auto' }}>
      <Tap href={href('S04')} label={tc('appName')} style={{ height: 64, borderRadius: 20, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/atmosx-logo.png" alt={tc('appName')} width={150} height={42} style={{ width: 150, height: 'auto' }} />
      </Tap>
      {TABS.map((tab) => item(tab.key, tab.path, tab.icon, tab.match(path), label(tab.key)))}
      <div style={{ height: 1, backgroundColor: c.line, marginBlock: 10 }} />
      {MORE.map((m) => item(m.key, m.path, m.icon, m.match(path), t(m.key)))}
    </nav>
  );
}
