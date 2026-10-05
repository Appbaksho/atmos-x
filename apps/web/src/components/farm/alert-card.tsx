'use client';
/** Farm alert presentation pieces shared by F01, F02 and F03 (V0-7). */
import { useTranslations } from 'next-intl';

import { B, Card, CzButton, href, I, Icon, Label, SourceChips, Tap, Txt, useCz, View } from '@/components/cz';
import { useTServer } from '@/i18n/server-text';
import type { FarmAlert, Meta } from '@/lib/data/types';

import { HAZARD_ICON, levelColors } from './farm-data';

/** "Tue 6 Oct" or "Tue 6 Oct – Wed 7 Oct" (dates only; the server windows are whole days). */
export function useWindowText() {
  const { f } = useCz();
  return (w: FarmAlert['window']) => {
    const o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    const a = f.date(w.from, o);
    const b = f.date(w.to, o);
    return a === b || !w.to ? a : `${a} – ${b}`;
  };
}

/** Alert href: /app/farm/alert/<id>?field=<fieldId> (the field gives F02 its crop, stage and place). */
export function alertHref(alert: FarmAlert, fieldId?: string | null) {
  return href('F02', { id: alert.id }, fieldId ? { field: fieldId } : undefined);
}

/** Level pill with the hazard name ("Heat alert"). */
export function AlertTag({ alert }: { alert: FarmAlert }) {
  const t = useTranslations('farm');
  const ts = useTServer();
  const col = levelColors(alert.level);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: col.bg, alignSelf: 'flex-start' }}>
      <Icon d={I.warn} size={12} color={col.fg} sw={2.6} />
      <Txt label color={col.fg} lines={1}>
        {t('home.alertTag', { hazard: ts({ code: `hazard.${alert.hazard}` }) })}
      </Txt>
    </View>
  );
}

/** F01: today's alert, ending in one action. */
export function AlertSummaryCard({ alert, fieldId, more, meta }: { alert: FarmAlert; fieldId?: string | null; more: number; meta?: Meta }) {
  const { c, f } = useCz();
  const t = useTranslations('farm');
  const ts = useTServer();
  const win = useWindowText();
  const col = levelColors(alert.level);
  const first = alert.actions[0];
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: col.bg }}>
      <View style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AlertTag alert={alert} />
          <Txt size={12} dim num>
            {win(alert.window)}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: col.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={HAZARD_ICON[alert.hazard]} size={19} color={alert.level === 'watch' ? B.orangeInk : col.bg} sw={2} />
          </View>
          <Txt size={18} w={600} style={{ lineHeight: 24, flex: 1, minWidth: 0 }} as="h2">
            {ts(alert.title)}
          </Txt>
        </View>
        <Txt size={13} dim>
          {ts(alert.body)}
        </Txt>
        <SourceChips sources={alert.sources} meta={meta && meta.live === false ? { ...meta, sources: [] } : undefined} />
      </View>
      <View style={{ backgroundColor: c.limeSoft, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
        {first ? (
          <View style={{ gap: 3 }}>
            <Label>{t('home.today')}</Label>
            <Txt size={15} w={600}>
              {ts(first)}
            </Txt>
          </View>
        ) : null}
        <CzButton label={t('home.whatToDo')} icon="arrow" size="md" href={alertHref(alert, fieldId)} />
        {more > 0 ? (
          <Tap role="link" label={t('home.more', { count: more, n: f.loc(more) })} href={href('F03')} style={{ alignSelf: 'center', minHeight: 36, justifyContent: 'center' }}>
            <Txt size={12.5} w={600} color={c.leaf} num>
              {t('home.more', { count: more, n: f.loc(more) })}
            </Txt>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

/** Calm state when the forecast has no alerts for this crop and stage. */
export function NoAlertsCard({ meta }: { meta?: Meta }) {
  const t = useTranslations('farm');
  return (
    <Card tone="limeSoft" gap={8}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.check} size={18} color={B.limeInk} sw={2.4} />
        </View>
        <Txt size={15} w={600} style={{ flex: 1, minWidth: 0 }}>
          {t('home.noAlerts')}
        </Txt>
      </View>
      <Txt size={12.5} dim>
        {t('home.noAlertsSub')}
      </Txt>
      {meta ? <SourceChips meta={meta} /> : null}
    </Card>
  );
}

/** Compact alert row (F03 lists) → F02. */
export function AlertRow({ alert, fieldId }: { alert: FarmAlert; fieldId?: string | null }) {
  const { c, f } = useCz();
  const ts = useTServer();
  const tf = useTranslations('farm');
  const win = useWindowText();
  const col = levelColors(alert.level);
  return (
    <Tap
      href={alertHref(alert, fieldId)}
      label={`${ts(alert.title)}, ${tf(`level.${alert.level}`)}, ${win(alert.window)}`}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 18, backgroundColor: c.bg, borderWidth: alert.level === 'danger' ? 2 : 0, borderColor: col.bg }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: col.soft }}>
        <Icon d={HAZARD_ICON[alert.hazard]} size={19} color={alert.level === 'watch' ? B.orangeInk : col.bg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: col.bg }}>
            <Txt label color={col.fg} style={{ fontSize: 10.5 }}>
              {tf(`level.${alert.level}`)}
            </Txt>
          </View>
          <Txt size={11.5} dim num>
            {win(alert.window)}
          </Txt>
        </View>
        <Txt size={13.5} w={600}>
          {ts(alert.title)}
        </Txt>
        {alert.actions[0] ? (
          <Txt size={12.5}>
            <Txt size={12.5} w={700} color={c.leaf} as="span">
              {f.rtl ? '←' : '→'}
            </Txt>{' '}
            {ts(alert.actions[0])}
          </Txt>
        ) : null}
      </View>
      <Icon d={f.fwdPath} size={16} color={c.ink2} style={{ alignSelf: 'center' }} />
    </Tap>
  );
}
