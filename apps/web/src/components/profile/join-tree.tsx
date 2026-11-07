'use client';
/** Accept a friend's invite to help water their tree (T5). Guests are asked to create an account first. */
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { CzButton, EmptyState, ErrorState, GhostButton, I, Screen, ScreenHeader, SkeletonCard, goReplace, href, requireAccount } from '@/components/cz';
import { useAcceptTreeInvite, useSession } from '@/lib/data/hooks';

export function JoinTreeScreen({ token }: { token: string | null }) {
  const t = useTranslations('profile.join');
  const session = useSession();
  const accept = useAcceptTreeInvite();
  const sent = useRef(false);

  useEffect(() => {
    if (!token || !session.ready || session.isGuest || sent.current) return;
    sent.current = true;
    accept.mutate(token, { onSuccess: (tree) => goReplace('tree', { id: tree.id }) });
  }, [token, session.ready, session.isGuest, accept]);

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.tree} title={t('bad')} sub={t('badSub')} action={t('mine')} actionHref={href('trees')} />
      </Screen>
    );
  }
  if (session.ready && session.isGuest) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <EmptyState icon={I.tree} title={t('guestTitle')} sub={t('guestSub')} action={t('guestCta')} onAction={() => requireAccount(t('feature'))} />
      </Screen>
    );
  }
  if (accept.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('title')} />
        <ErrorState error={accept.error} title={t('bad')} />
        <GhostButton label={t('mine')} href={href('trees')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={t('title')} />
      <SkeletonCard lines={2} height={120} />
      <CzButton label={t('joining')} busy onPress={() => undefined} />
    </Screen>
  );
}
