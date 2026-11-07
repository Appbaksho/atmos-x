'use client';
/**
 * App shell for /app/**: sidebar (≥ 1024 px) or floating tab bar, Ask Atmos slot, offline pill,
 * install banner, onboarding redirect (/app → /app/onboarding/welcome until prefs.onboarded) and
 * `?demo=1` → Presentation mode.
 */
import React, { useEffect } from 'react';

import { usePathname } from '@/i18n/navigation';
import { useLocation } from '@/lib/location';
import { useCz } from '@/lib/prefs';
import { goReplace } from '@/lib/routes';

import { HeaderMenuSlot } from '../header-slot';
import { AccountMenuButton } from './account-menu';
import { InstallBanner } from './install';
import { LocationGate, needsPlaceGate } from './location-gate';
import { OfflineIndicator } from './offline';
import { AskProvider } from './ask-slot';
import { Sidebar, TabBar } from './tab-bar';

/** One element for every tab-root header (the slot is a ReactNode, not a component). */
const MENU = <AccountMenuButton />;

const demoParam = () => new URLSearchParams(window.location.search).get('demo') === '1';

function useOnboardingGate() {
  const { prefs, ready, setPrefs } = useCz();
  const path = usePathname();

  // `?demo=1` = Presentation mode with Nadia's story, so onboarding is skipped too (like "Try the
  // Dhaka demo" on S01). The redirect below also checks the param, so it can't race this write.
  useEffect(() => {
    if (demoParam()) setPrefs({ presentation: true, onboarded: true });
  }, [setPrefs]);

  useEffect(() => {
    if (ready && !prefs.onboarded && path === '/app' && !demoParam()) goReplace('S01');
  }, [ready, prefs.onboarded, path]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useOnboardingGate();
  const bare = path.startsWith('/app/onboarding');
  const loc = useLocation();
  // L11: no silent default place. A screen that needs one asks for it when nothing resolved.
  const gate = !bare && loc.needsPlace && needsPlaceGate(path);
  return (
    <HeaderMenuSlot.Provider value={MENU}>
      <AskProvider>
        {bare ? null : <Sidebar />}
        <div className={bare ? 'cz-shell' : 'cz-shell cz-shell-main'}>{gate ? <LocationGate /> : children}</div>
        {bare ? null : <TabBar />}
        <OfflineIndicator />
        <InstallBanner />
      </AskProvider>
    </HeaderMenuSlot.Provider>
  );
}
