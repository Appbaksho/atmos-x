'use client';
/**
 * App shell for /app/**: sidebar (≥ 1024 px) or floating tab bar, Ask Atmos slot, offline pill,
 * install banner, onboarding redirect (/app → /app/onboarding/welcome until prefs.onboarded) and
 * `?demo=1` → Presentation mode.
 */
import React, { useEffect } from 'react';

import { usePathname } from '@/i18n/navigation';
import { useCz } from '@/lib/prefs';
import { goReplace } from '@/lib/routes';

import { InstallBanner } from './install';
import { OfflineIndicator } from './offline';
import { AskProvider } from './ask-slot';
import { Sidebar, TabBar } from './tab-bar';

function useOnboardingGate() {
  const { prefs, ready, setPrefs } = useCz();
  const path = usePathname();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') setPrefs({ presentation: true });
  }, [setPrefs]);

  useEffect(() => {
    if (ready && !prefs.onboarded && path === '/app') goReplace('S01');
  }, [ready, prefs.onboarded, path]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useOnboardingGate();
  const bare = path.startsWith('/app/onboarding');
  return (
    <AskProvider>
      {bare ? null : <Sidebar />}
      <div className={bare ? 'cz-shell' : 'cz-shell cz-shell-main'}>{children}</div>
      {bare ? null : <TabBar />}
      <OfflineIndicator />
      <InstallBanner />
    </AskProvider>
  );
}
