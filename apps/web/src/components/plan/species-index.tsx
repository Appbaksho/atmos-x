'use client';
/** P5 · /app/species: every species for the area, filterable (SpeciesCatalog, expanded). */
import { useTranslations } from 'next-intl';

import { Screen, ScreenHeader } from '@/components/cz';
import { useSession, DEMO_POINT } from '@/lib/data/hooks';
import { useLocation } from '@/lib/location';

import { SpeciesCatalog } from './species-catalog';

export function SpeciesIndex() {
  const t = useTranslations('plan');
  const session = useSession();
  const { focus } = useLocation();
  return (
    <Screen>
      <ScreenHeader title={t('speciesAll')} sub={t('speciesAllSub')} />
      <SpeciesCatalog point={session.presentation ? DEMO_POINT : focus} expanded />
    </Screen>
  );
}
