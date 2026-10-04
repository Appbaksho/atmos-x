'use client';
/**
 * Guest gate (prompt-v0 §4.5). `requireAccount()` opens the global "Create a free account" sheet
 * (<AccountSheet/>, mounted once by the root providers). It also opens automatically when any
 * TanStack query/mutation throws GuestRestrictedError (see src/lib/query.tsx).
 *
 *   if (isGuest) return requireAccount(t('logAction'));   // feature text is optional
 *
 * The sheet links to /auth/register and /auth/login (V0-6) with `?next=<current path>`.
 */
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

import { usePathname } from '@/i18n/navigation';
import { href } from '@/lib/routes';
import { useCz } from '@/lib/prefs';

import { I } from './icons';
import { BottomSheet } from './sheet';
import { B } from './tokens';
import { CzButton, GhostButton, Icon, Note, Txt, View } from './ui';

type State = { open: boolean; feature: string | null };
let state: State = { open: false, feature: null };
const listeners = new Set<() => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

/** Open the "Create a free account" sheet. `feature`: translated text, e.g. "log an action". */
export function requireAccount(feature?: string | null) {
  set({ open: true, feature: feature ?? null });
}
export function closeAccountSheet() {
  set({ ...state, open: false });
}
/** `{ open, feature }` of the global sheet. */
export function useAccountSheet() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const PERKS = ['actions', 'teams', 'goals', 'trees', 'notifs'] as const;
const PERK_ICON: Record<(typeof PERKS)[number], string> = { actions: I.camera, teams: I.community, goals: I.target, trees: I.tree, notifs: I.bell };

export function AccountSheet() {
  const { open, feature } = useAccountSheet();
  const { c } = useCz();
  const t = useTranslations('common.account');
  const path = usePathname();
  const next = { next: path };
  return (
    <BottomSheet
      open={open}
      onClose={closeAccountSheet}
      title={t('title')}
      leading={
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.lock} size={18} color={B.lime} sw={2} />
        </View>
      }>
      <Txt size={13.5} dim>
        {feature ? t('feature', { feature }) : t('body')}
      </Txt>
      <View style={{ gap: 10 }}>
        {PERKS.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon d={PERK_ICON[k]} size={16} color={c.leaf} sw={2} />
            </View>
            <Txt size={13.5} w={500} style={{ flex: 1 }}>
              {t(`perks.${k}`)}
            </Txt>
          </View>
        ))}
      </View>
      <Note icon={I.info}>{t('note')}</Note>
      <CzButton label={t('create')} icon="check" href={href('register', undefined, next)} onPress={closeAccountSheet} />
      <GhostButton label={t('signIn')} href={href('login', undefined, next)} onPress={closeAccountSheet} height={46} />
      <GhostButton label={t('notNow')} onPress={closeAccountSheet} height={46} style={{ borderWidth: 0 }} />
    </BottomSheet>
  );
}
