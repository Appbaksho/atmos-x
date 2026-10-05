'use client';
/** Simple landing used until V0-9 ships the real one: logo, pitch, "Open the app", "Install". */
import { useTranslations } from 'next-intl';

import { href } from '@/lib/routes';

import { useInstall } from './shell/install';
import { toast } from './toast';
import { B } from './tokens';
import { CzButton, GhostButton, LightStatusBar, Txt, View } from './ui';

export function LandingPlaceholder() {
  const t = useTranslations('common.landingPlaceholder');
  const ti = useTranslations('common.install');
  const ins = useInstall();
  return (
    <main id="main" className="cz-view" style={{ minHeight: '100dvh', backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <LightStatusBar />
      <View style={{ width: '100%', maxWidth: 520, alignItems: 'center', gap: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/atmosx-logo.png" alt="Atmos X" width={1415} height={397} style={{ width: 'min(340px, 80vw)', height: 'auto' }} />
        <Txt size={17} center color={B.white} style={{ opacity: 0.9 }} as="p">
          {t('pitch')}
        </Txt>
        <View style={{ width: '100%', maxWidth: 360, gap: 12 }}>
          <CzButton label={t('open')} href={href('S04')} icon="arrow" />
          {ins.standalone ? null : (
            <GhostButton
              label={t('install')}
              color={B.white}
              style={{ borderColor: 'rgba(255,255,255,0.35)' }}
              onPress={() => {
                if (ins.canPrompt) void ins.prompt();
                else toast(ti('iosHint'));
              }}
            />
          )}
        </View>
      </View>
    </main>
  );
}
