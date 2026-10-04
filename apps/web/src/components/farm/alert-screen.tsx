'use client';
/**
 * F02 · Alert detail (V0-7): hazard, level colour, lead time and window, why it fired, what to do,
 * the one thing to do today, sources. The alert is looked up by id in useFarmAlerts for the field
 * given by `?field=` (or the first saved field, or the guest preview at the focus point).
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { B, Card, CzButton, EmptyState, ErrorState, href, Icon, Label, Note, Screen, ScreenHeader, SkeletonCard, SourceChips, Txt, useCz, useLocation, View, I } from '@/components/cz';
import { useTServer } from '@/i18n/server-text';
import { useAskContext } from '@/components/ask/ask-context';
import { useFarmAlerts, useFields, useSession } from '@/lib/data/hooks';

import { AlertTag, useWindowText } from './alert-card';
import { alertsInput, daysUntil, HAZARD_ICON, levelColors, PREVIEW_CROP } from './farm-data';

export function AlertScreen({ id, fieldId }: { id: string; fieldId?: string }) {
  const { c, f } = useCz();
  const t = useTranslations('farm');
  const ts = useTServer();
  const win = useWindowText();
  const { focus } = useLocation();
  const session = useSession();
  const fieldsQ = useFields();
  const fields = fieldsQ.data ?? [];
  const field = fields.find((x) => x.id === fieldId) ?? fields[0] ?? null;
  const waiting = fieldsQ.isPending && !session.isGuest;
  const q = useFarmAlerts(waiting ? null : alertsInput(field, focus ?? null));
  const [done, setDone] = useState(false);

  const alert = q.data?.alerts.find((a) => a.id === id) ?? null;
  useAskContext({
    context: field ? { field_id: field.id, lat: field.location.lat, lng: field.location.lng } : undefined,
    place: field?.name,
    visible: { crop: field?.crop ?? PREVIEW_CROP, stage: field?.stage ?? 'flowering', alert: alert ? { id: alert.id, hazard: alert.hazard, level: alert.level, window: alert.window } : null },
  });
  const sub = t('alert.forField', { field: field?.name ?? t('home.preview'), crop: t(`crop.${field?.crop ?? PREVIEW_CROP}`) });

  if (waiting || q.isPending) {
    return (
      <Screen>
        <ScreenHeader title={t('alert.title')} sub={sub} />
        <SkeletonCard lines={3} height={190} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('alert.title')} sub={sub} />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  if (!alert) {
    return (
      <Screen>
        <ScreenHeader title={t('alert.title')} sub={sub} />
        <EmptyState icon={I.bell} title={t('alert.notFound')} sub={t('alert.notFoundSub')} action={t('alert.backFarm')} actionHref={href('F03')} />
      </Screen>
    );
  }

  const col = levelColors(alert.level);
  const lead = daysUntil(alert.window.from);
  const first = alert.actions[0];

  return (
    <Screen>
      <ScreenHeader title={ts(alert.title)} sub={sub} />

      {/* Hazard + level */}
      <View style={{ backgroundColor: B.navy, borderRadius: 28, padding: 18, gap: 14, borderWidth: c.dark ? 1 : 0, borderColor: c.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: col.bg, alignItems: 'center', justifyContent: 'center' }}>
            {alert.emoji ? (
              <span aria-hidden style={{ fontSize: 28, lineHeight: 1 }}>
                {alert.emoji}
              </span>
            ) : (
              <Icon d={HAZARD_ICON[alert.hazard]} size={28} color={col.fg} sw={2} />
            )}
          </View>
          <AlertTag alert={alert} />
        </View>
        <Txt size={20} w={600} color={B.white} style={{ lineHeight: 26 }}>
          {ts(alert.title)}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <NavyTile label={t('alert.lead')} value={lead === 0 ? t('alert.leadNow') : t('alert.leadDays', { n: lead })} />
          <NavyTile label={t('alert.when')} value={win(alert.window)} />
        </View>
      </View>

      {/* Why */}
      <Card gap={8}>
        <Label>{t('alert.why')}</Label>
        <Txt size={14}>{ts(alert.body)}</Txt>
        <SourceChips sources={alert.sources} meta={q.data?.meta && q.data.meta.live === false ? { ...q.data.meta, sources: [] } : undefined} />
        <Txt size={11.5} dim>
          {t('alert.rule')}
        </Txt>
      </Card>

      {/* What to do */}
      {alert.actions.length > 1 ? (
        <Card gap={10}>
          <Label>{t('alert.todo')}</Label>
          {alert.actions.map((a, k) => (
            <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.limeSoft, marginTop: 1 }}>
                <Txt size={11} w={700} style={{ lineHeight: 14 }}>
                  {f.loc(k + 1)}
                </Txt>
              </View>
              <Txt size={13.5} style={{ flex: 1, minWidth: 0 }}>
                {ts(a)}
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}

      {/* The one thing to do today */}
      {first ? (
        <Card tone="limeSoft" pad={18}>
          <Label>{t('alert.oneToday')}</Label>
          <Txt display size={18} style={{ lineHeight: 24 }}>
            {ts(first)}
          </Txt>
          <CzButton label={done ? t('alert.doneOk') : t('alert.done')} icon="check" onPress={() => setDone(!done)} />
        </Card>
      ) : null}

      <Note tone="navy" icon={I.info}>
        <Txt size={12} color={B.white}>
          {t('alert.dae')}
        </Txt>
      </Note>
    </Screen>
  );
}

function NavyTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 2 }}>
      <Txt size={11} color="rgba(255,255,255,0.75)">
        {label}
      </Txt>
      <Txt size={15} w={600} num color={B.white} lines={1}>
        {value}
      </Txt>
    </View>
  );
}
