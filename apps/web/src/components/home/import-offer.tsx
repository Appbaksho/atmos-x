'use client';
/** A9: one-time offer to bring this device's V0 goals, trees, actions and photos into the account. */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Card, CzButton, ErrorState, GhostButton, I, Icon, Txt, View, toast, useCz } from '@/components/cz';
import { useDeviceImport, useDeviceImportOffer } from '@/lib/data/hooks';

const DISMISS = 'atmos:import-dismissed';

function dismissed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(DISMISS) === '1';
  } catch {
    return false;
  }
}

export function ImportOffer() {
  const t = useTranslations('home.import');
  const { c, f } = useCz();
  const offer = useDeviceImportOffer();
  const run = useDeviceImport();
  const [hidden, setHidden] = useState(dismissed);
  if (hidden || !offer.data) return null;

  const hide = () => {
    try {
      window.localStorage.setItem(DISMISS, '1');
    } catch {
      /* private mode: hide for this visit only */
    }
    setHidden(true);
  };

  return (
    <Card gap={10} style={{ marginInline: 16, borderWidth: 2, borderColor: c.accent }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Icon d={I.device} size={20} sw={1.8} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt size={15} w={600} as="h2">
            {t('title')}
          </Txt>
          <Txt size={12.5} dim>
            {t('sub', { count: offer.data.count, n: f.loc(offer.data.count) })}
          </Txt>
        </View>
      </View>
      {run.isError ? <ErrorState compact error={run.error} title={t('failed')} /> : null}
      <CzButton
        label={t('cta')}
        icon="check"
        size="md"
        busy={run.isPending}
        onPress={() =>
          run.mutate(undefined, {
            onSuccess: (r) => toast(t('done', { trees: f.loc(r.trees), actions: f.loc(r.actions), goals: f.loc(r.goals + r.drafts) }), { tone: 'success' }),
          })
        }
      />
      <GhostButton label={t('later')} height={42} onPress={hide} disabled={run.isPending} />
      <Txt size={11} dim>
        {t('note')}
      </Txt>
    </Card>
  );
}
