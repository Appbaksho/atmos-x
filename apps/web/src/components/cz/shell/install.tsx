'use client';
/**
 * PWA install: captures `beforeinstallprompt` (Chrome/Edge/Android) as early as possible and
 * exposes it via useInstall(); iOS gets the "Share → Add to Home Screen" hint instead.
 * <InstallBanner/> is shown in the app shell once onboarded; the landing page uses useInstall().
 */
import { useTranslations } from 'next-intl';
import { useCallback, useSyncExternalStore } from 'react';

import { usePathname } from '@/i18n/navigation';
import { useCz } from '@/lib/prefs';

import { useMounted } from '../hooks';
import { I } from '../icons';
import { B, SHADOW } from '../tokens';
import { Icon, IconBtn, PillButton, Txt, View } from '../ui';
import { isTabRoot } from './tab-bar';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const DISMISS_KEY = 'atmos:install-dismissed';
const DISMISS_MS = 14 * 24 * 3600 * 1000;

function readDismissed(): boolean {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - v < DISMISS_MS;
  } catch {
    return false;
  }
}

type Snapshot = { canPrompt: boolean; isIOS: boolean; standalone: boolean; dismissed: boolean };
let snap: Snapshot | null = null;
function getSnapshot(): Snapshot {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone = installed || window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const next = { canPrompt: !!deferred, isIOS, standalone, dismissed: readDismissed() };
  if (snap && snap.canPrompt === next.canPrompt && snap.isIOS === next.isIOS && snap.standalone === next.standalone && snap.dismissed === next.dismissed) return snap;
  snap = next;
  return next;
}
const SERVER: Snapshot = { canPrompt: false, isIOS: false, standalone: false, dismissed: true };

/** `{ canPrompt, isIOS, standalone, dismissed, available, prompt(), dismiss() }` */
export function useInstall() {
  const s = useSyncExternalStore(subscribe, getSnapshot, () => SERVER);
  const prompt = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome === 'accepted';
  }, []);
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    emit();
  }, []);
  return { ...s, available: !s.standalone && (s.canPrompt || s.isIOS), prompt, dismiss };
}

export function InstallBanner() {
  const { c, prefs, ready } = useCz();
  const mounted = useMounted();
  const t = useTranslations('common.install');
  const tc = useTranslations('common');
  const ins = useInstall();
  const path = usePathname();
  // Only on the tab roots, so it never covers a stacked screen's header. Not on the Map either:
  // its legend, layer switch and the desktop zone panel sit right where the banner would float.
  if (!mounted || !ready || !prefs.onboarded || !ins.available || ins.dismissed || !isTabRoot(path, prefs.farmer_mode) || path === '/app/map') return null;
  return (
    <div className="cz-install" role="region" aria-label={t('title')} style={{ position: 'fixed', zIndex: 80, top: 'calc(env(safe-area-inset-top, 0px) + 10px)', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <View style={[{ pointerEvents: 'auto', width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }, SHADOW.card]}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ins.isIOS && !ins.canPrompt ? I.share : I.device} size={20} color={B.lime} sw={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={13.5} w={600}>
            {t('title')}
          </Txt>
          <Txt size={11.5} dim>
            {ins.canPrompt ? t('body') : t('iosHint')}
          </Txt>
        </View>
        {ins.canPrompt ? <PillButton label={t('cta')} tone="lime" onPress={() => void ins.prompt()} /> : null}
        <IconBtn d={I.close} label={tc('close')} onPress={ins.dismiss} size={36} iconSize={14} />
      </View>
    </div>
  );
}
