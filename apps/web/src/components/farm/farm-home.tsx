'use client';
/**
 * F01 · Farmer home (V0-7). Rendered by V0-4's Home (`/app`) when prefs.farmer_mode is on, as the
 * whole page body: it renders its own `<Screen tab bleed>`.
 *
 * Field hero (first saved field, or a guest preview at the focus point), the stage the farmer set,
 * today's most severe alert ending in one action, the 5-day forecast and field-edge trees.
 * Data: useFields, useConditions, useFarmAlerts. No demo numbers.
 */
import { useTranslations } from 'next-intl';

import { B, Card, CzButton, ErrorState, GlassPill, href, I, Icon, IconBtn, Label, LightStatusBar, Photo, Screen, SkeletonCard, SourceChips, Tap, Txt, useCz, useLocation, View } from '@/components/cz';
import { useAskContext } from '@/components/ask/ask-context';
import { AccountMenuButton } from '@/components/cz/shell/account-menu';
import { useConditions, useFarmAlerts, useFields, useSession, useUnreadCount } from '@/lib/data/hooks';
import type { FarmField } from '@/lib/data/types';

import { AlertSummaryCard, NoAlertsCard } from './alert-card';
import { alertsInput, EDGE_PHOTO, FIELD_PHOTO, FIELD_PHOTO_CREDIT, PREVIEW_CROP, PREVIEW_STAGE, sortAlerts } from './farm-data';
import { DayStrip } from './day-strip';
import { StageBar } from './stage-bar';

export function FarmHome() {
  const { c, f } = useCz();
  const t = useTranslations('farm');
  const { focus, placeName } = useLocation();
  const session = useSession();
  const fieldsQ = useFields();
  const field: FarmField | null = fieldsQ.data?.[0] ?? null;
  const preview = !field;
  const point = field?.location ?? focus ?? null;
  const cond = useConditions(point);
  const alertsQ = useFarmAlerts(fieldsQ.isPending && !session.isGuest ? null : alertsInput(field, focus ?? null));
  const unread = useUnreadCount();

  const crop = field?.crop ?? PREVIEW_CROP;
  const stage = field?.stage ?? PREVIEW_STAGE;
  const alerts = sortAlerts(alertsQ.data?.alerts ?? []);
  const top = alerts[0];
  const place = placeName || t('home.heroA11y');
  const unreadN = unread.data ?? 0;
  useAskContext({
    context: field ? { field_id: field.id, lat: field.location.lat, lng: field.location.lng } : undefined,
    place: field?.name,
    visible: { crop, stage, field: field?.name ?? null, alerts: alerts.slice(0, 3).map((a) => ({ id: a.id, hazard: a.hazard, level: a.level, from: a.window.from })) },
  });

  return (
    <Screen tab bleed>
      <LightStatusBar />
      {/* Field hero */}
      <Photo src={FIELD_PHOTO} style={{ height: 400 }} scrim={[[0, 0.55], [0.3, 0.05], [0.58, 0.3], [1, 0.88]]} label={FIELD_PHOTO_CREDIT}>
        <View style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', start: 20, end: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Tap role="link" label={place} href={href('F03')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 0, flexShrink: 1 }}>
            <Icon d={I.pin} size={18} color={B.white} />
            <Txt size={14} w={500} color={B.white} lines={1}>
              {place}
            </Txt>
          </Tap>
          <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
            <IconBtn d={I.bell} label={t('home.notifications')} tone="glass" iconSize={20} badge={unreadN > 0} href={href('S21')} />
            <AccountMenuButton tone="glass" />
          </View>
        </View>
        <View style={{ position: 'absolute', start: 20, end: 20, bottom: 24, gap: 10, pointerEvents: 'none' }}>
          {preview ? (
            <GlassPill dark style={{ alignSelf: 'flex-start' }}>
              <Txt size={11.5} w={600} color={B.white}>
                {t('home.preview')}
              </Txt>
            </GlassPill>
          ) : (
            <Txt size={13} color="rgba(255,255,255,0.88)" num>
              {field.area ? t('home.fieldLine', { name: field.name, area: f.dec(field.area, 1) }) : field.name}
            </Txt>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexShrink: 1, minWidth: 0, gap: 6 }}>
              <Txt display size={28} color={B.white} as="h1" style={{ lineHeight: 32 }}>
                {t(`crop.${crop}`)}
              </Txt>
              <Txt size={14} w={600} color={B.lime}>
                {t(`stage.${stage}`)}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <Txt size={48} num color={B.white} style={{ lineHeight: 52, letterSpacing: -1.4 }}>
                {cond.data ? f.deg(cond.data.air_c) : '–'}
              </Txt>
              <Txt size={11.5} color="rgba(255,255,255,0.85)">
                {t('home.airNow')}
              </Txt>
            </View>
          </View>
        </View>
      </Photo>

      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        {preview && fieldsQ.isSuccess ? (
          <Card tone="limeSoft" gap={10}>
            <Txt size={13}>{t('home.previewSub', { crop: t(`crop.${crop}`), stage: t(`stage.${stage}`), place })}</Txt>
            <CzButton label={t('home.addField')} icon="plus" size="md" href={href('F03', undefined, { add: '1' })} />
          </Card>
        ) : null}

        {/* Growth stage (the stage the farmer set) */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Label>{t('home.growth')}</Label>
            <Tap role="link" label={t('home.change')} href={href('F03')} style={{ minHeight: 32, justifyContent: 'center' }}>
              <Txt size={12.5} w={600} color={c.leaf}>
                {t('home.change')}
              </Txt>
            </Tap>
          </View>
          <StageBar stage={stage} />
          <Txt size={11.5} dim>
            {t('home.stageSet')}
          </Txt>
        </Card>

        {/* Today's alert, ending in one action */}
        {alertsQ.isPending ? (
          <SkeletonCard lines={4} />
        ) : alertsQ.isError ? (
          <ErrorState error={alertsQ.error} onRetry={() => void alertsQ.refetch()} />
        ) : top ? (
          <AlertSummaryCard alert={top} fieldId={field?.id} more={alerts.length - 1} meta={alertsQ.data?.meta} />
        ) : (
          <NoAlertsCard meta={alertsQ.data?.meta} />
        )}

        {/* 5-day forecast */}
        {cond.isPending ? (
          <SkeletonCard lines={3} height={170} />
        ) : cond.isError ? (
          <ErrorState error={cond.error} onRetry={() => void cond.refetch()} compact />
        ) : cond.data ? (
          <Card>
            <Label>{t('home.forecast')}</Label>
            <DayStrip days={cond.data.forecast.slice(0, 5)} />
            <SourceChips meta={cond.data.meta} />
          </Card>
        ) : null}

        {/* Field-edge trees */}
        <Card style={{ flexDirection: 'row', alignItems: 'center' }} pad={10} gap={12}>
          <Photo src={EDGE_PHOTO} style={{ width: 72, height: 72, borderRadius: 16 }} label={t('home.edgeTitle')} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Txt size={14} w={600}>
              {t('home.edgeTitle')}
            </Txt>
            <Txt size={12} dim>
              {t('home.edgeSub')}
            </Txt>
          </View>
          <CzButton label={t('home.log')} icon="camera" size="sm" href={href('S14')} style={{ paddingEnd: 14 }} />
        </Card>
      </View>
    </Screen>
  );
}
