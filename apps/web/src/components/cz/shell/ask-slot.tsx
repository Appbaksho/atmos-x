'use client';
/**
 * Ask Atmos slot (S29). V0-1 owns the floating button + open state; V0-7 owns the panel in
 * src/components/ask/ask-panel.tsx (a stub until then). The panel receives the current ScreenId.
 *
 *   const { open, close, isOpen, screen } = useAsk();   // anywhere under the app shell
 *   go('S29')                                           // same as open()
 *
 * Hidden when prefs.ask_on is false, on onboarding and on the log-action camera screen.
 */
import { useTranslations } from 'next-intl';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { AskPanel } from '@/components/ask/ask-panel';
import { usePathname } from '@/i18n/navigation';
import type { ScreenId } from '@/lib/data/types';
import { useCz } from '@/lib/prefs';
import { bindAskOpener, screenIdForPath } from '@/lib/routes';

import { useMounted } from '../hooks';
import { I } from '../icons';
import { B, SHADOW } from '../tokens';
import { Icon, Tap } from '../ui';

type AskState = { open: () => void; close: () => void; isOpen: boolean; screen: ScreenId | null; visible: boolean };
const Ctx = createContext<AskState | null>(null);

export function useAsk(): AskState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAsk must be used inside AskProvider (the app shell)');
  return v;
}

const TAB_PATHS = new Set(['/app', '/app/map', '/app/plan', '/app/community', '/app/profile']);
const HIDDEN_PREFIXES = ['/app/log-action', '/app/onboarding'];

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const { prefs } = useCz();
  const path = usePathname();
  const screen = screenIdForPath(path, prefs.farmer_mode);
  const visible = prefs.ask_on && !HIDDEN_PREFIXES.some((p) => path.startsWith(p));

  useEffect(() => {
    bindAskOpener(() => setOpen(true));
    return () => bindAskOpener(null);
  }, []);

  const value = useMemo<AskState>(() => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false), screen, visible }), [isOpen, screen, visible]);
  const onTab = TAB_PATHS.has(path);

  return (
    <Ctx.Provider value={value}>
      {children}
      {visible ? <AskFab onTab={onTab} hidden={isOpen} onPress={value.open} /> : null}
      <AskPanel open={isOpen && visible} onClose={value.close} screen={screen} />
    </Ctx.Provider>
  );
}

function AskFab({ onTab, hidden, onPress }: { onTab: boolean; hidden: boolean; onPress: () => void }) {
  const t = useTranslations('common');
  const mounted = useMounted();
  if (hidden || !mounted) return null;
  const size = onTab ? 56 : 48;
  return (
    <Tap
      label={t('askAtmos')}
      haptic
      onPress={onPress}
      className={onTab ? 'cz-ask-fab cz-ask-fab-tab' : 'cz-ask-fab'}
      style={[
        {
          position: 'fixed',
          end: 16,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: B.lime,
          backgroundColor: B.navy,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 70,
        },
        SHADOW.fab,
      ]}>
      <Icon d={I.sparkle} size={24} color={B.lime} sw={2} />
    </Tap>
  );
}
