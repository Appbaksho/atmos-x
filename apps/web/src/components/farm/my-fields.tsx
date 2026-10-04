'use client';
/**
 * F03 · My fields (V0-7). Rendered at /app/farm/fields and by V0-4's Map tab in farmer mode, as the
 * whole page body: it renders its own `<Screen tab>`. `onSelect` is called when a field is picked.
 *
 * View mode: OpenStreetMap with field pills, the field list, field weather (useConditions) and the
 * field's alerts (useFarmAlerts). Add / edit mode: name, crop, stage, area and a pin on the map, with
 * a live alert preview. Guests can preview alerts for any crop without saving (requireAccount on save).
 */
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  B,
  Card,
  CzButton,
  EmptyState,
  ErrorState,
  Field,
  GhostButton,
  I,
  Icon,
  Label,
  requireAccount,
  Screen,
  SkeletonCard,
  SkeletonText,
  SourceChips,
  Stepper,
  Tap,
  toast,
  Txt,
  useCz,
  useLocation,
  View,
} from '@/components/cz';
import { useAskContext } from '@/components/ask/ask-context';
import { useAddField, useConditions, useFarmAlerts, useFields, useRemoveField, useSession, useUpdateField } from '@/lib/data/hooks';
import type { CropId, FarmField, LatLng, StageId } from '@/lib/data/types';

import { AlertRow } from './alert-card';
import { DayStrip } from './day-strip';
import { alertsInput, CROP_IDS, PREVIEW_CROP, PREVIEW_STAGE, sortAlerts, STAGE_IDS, TI } from './farm-data';
import { FieldMap } from './field-map';

type Form = { name: string; crop: CropId; stage: StageId; area: number; location: LatLng | null };

export function MyFields({ onSelect }: { onSelect?: (field: FarmField) => void } = {}) {
  const { c, f } = useCz();
  const t = useTranslations('farm');
  const { focus, device, refresh } = useLocation();
  const session = useSession();
  const fieldsQ = useFields();
  const fields = fieldsQ.data ?? [];
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [form, setForm] = useState<Form>({ name: '', crop: PREVIEW_CROP, stage: PREVIEW_STAGE, area: 1, location: null });
  const add = useAddField();
  const update = useUpdateField();
  const remove = useRemoveField();

  const sel = fields.find((x) => x.id === selId) ?? fields[0] ?? null;
  const editing = mode !== 'view';
  useAskContext(
    sel ? { context: { field_id: sel.id, lat: sel.location.lat, lng: sel.location.lng }, place: sel.name, visible: { crop: sel.crop, stage: sel.stage, field: sel.name, fields: fields.length } } : null,
  );
  const center = focus ?? { lat: 23.759, lng: 90.359 };

  const startAdd = () => {
    setForm({ name: '', crop: sel?.crop ?? PREVIEW_CROP, stage: sel?.stage ?? PREVIEW_STAGE, area: 1, location: focus ?? null });
    setMode('add');
  };
  const startEdit = (fl: FarmField) => {
    setForm({ name: fl.name, crop: fl.crop, stage: fl.stage, area: fl.area ?? 1, location: fl.location });
    setMode('edit');
  };

  // `?add=1` (from Farmer home) opens the form. Read once on mount, without useSearchParams.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('add') === '1') {
      const id = requestAnimationFrame(() => startAdd());
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const pick = (fl: FarmField) => {
    setSelId(fl.id);
    setMode('view');
    onSelect?.(fl);
  };

  const save = async () => {
    if (session.isGuest) return requireAccount(t('fields.saveFields'));
    const location = form.location ?? focus;
    if (!location) return;
    const input = { name: form.name.trim() || t('fields.newField'), crop: form.crop, stage: form.stage, area: form.area, location };
    try {
      if (mode === 'edit' && sel) {
        await update.mutateAsync({ id: sel.id, patch: input });
      } else {
        const created = await add.mutateAsync(input);
        setSelId(created.id);
      }
      toast(t('fields.saved'), { tone: 'success' });
      setMode('view');
    } catch {
      /* GuestRestrictedError opens the account sheet globally; other errors show below */
    }
  };

  const del = async () => {
    if (!sel) return;
    try {
      await remove.mutateAsync(sel.id);
      setSelId(null);
      setMode('view');
      toast(t('fields.removed'));
    } catch {
      /* handled globally */
    }
  };

  const totalArea = fields.reduce((a, x) => a + (x.area ?? 0), 0);
  const sub = totalArea > 0 ? t('fields.subArea', { count: fields.length, n: f.loc(fields.length), area: f.dec(totalArea, 1) }) : t('fields.sub', { count: fields.length, n: f.loc(fields.length) });

  return (
    <Screen tab>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
        <View style={{ flexShrink: 1, minWidth: 0, gap: 4 }}>
          <Txt display size={21} as="h1">
            {t('fields.myFields')}
          </Txt>
          <Txt size={12} dim num>
            {fieldsQ.isPending ? '' : sub}
          </Txt>
        </View>
        {!editing ? (
          <Tap
            label={t('fields.addBtn')}
            haptic
            onPress={startAdd}
            style={{ height: 44, paddingStart: 12, paddingEnd: 16, borderRadius: 999, backgroundColor: B.lime, flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: '3px 3px 4px rgba(0,0,0,0.1)', flexShrink: 0 }}>
            <Icon d={I.plus} size={18} color={B.limeInk} sw={2.2} />
            <Txt size={13} w={600} color={B.limeInk}>
              {t('fields.addBtn')}
            </Txt>
          </Tap>
        ) : null}
      </View>

      <FieldMap
        fields={fields}
        selectedId={sel?.id}
        onSelect={pick}
        center={center}
        pin={editing ? form.location : undefined}
        onPin={editing ? (p) => setForm((x) => ({ ...x, location: p })) : undefined}
        hint={editing ? t('fields.pinHint') : undefined}
      />

      {editing ? (
        <>
          <Card gap={16}>
            <Txt display size={15} as="h2">
              {mode === 'edit' ? t('fields.editTitle') : t('fields.addTitle')}
            </Txt>
            {session.isGuest ? (
              <Txt size={12.5} dim>
                {t('fields.guestNote')}
              </Txt>
            ) : null}
            <Field label={t('fields.fName')} value={form.name} onChangeText={(name: string) => setForm((x) => ({ ...x, name }))} placeholder={t('fields.newField')} maxLength={60} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Label>{t('fields.area')}</Label>
                <Txt size={15} w={600} num>
                  {`${f.dec(form.area, 1)} ${t('fields.acresW')}`}
                </Txt>
              </View>
              <Stepper
                value={f.dec(form.area, 1)}
                label={t('fields.area')}
                onDec={() => setForm((x) => ({ ...x, area: Math.max(0.1, +(x.area - 0.1).toFixed(1)) }))}
                onInc={() => setForm((x) => ({ ...x, area: Math.min(50, +(x.area + 0.1).toFixed(1)) }))}
                decDisabled={form.area <= 0.1}
              />
            </View>
            <ChipGroup label={t('fields.cropL')} options={CROP_IDS.map((k) => ({ value: k, label: t(`crop.${k}`) }))} value={form.crop} onChange={(crop) => setForm((x) => ({ ...x, crop }))} />
            <ChipGroup label={t('fields.stageL')} options={STAGE_IDS.map((k) => ({ value: k, label: t(`stage.${k}`) }))} value={form.stage} onChange={(stage) => setForm((x) => ({ ...x, stage }))} />
            <View style={{ gap: 8 }}>
              <Label>{t('fields.pinL')}</Label>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Txt size={12.5} dim num style={{ flex: 1, minWidth: 140 }}>
                  {form.location ? `${f.dec(form.location.lat, 4)}, ${f.dec(form.location.lng, 4)}` : t('fields.pinHint')}
                </Txt>
                <GhostButton
                  label={t('fields.useMyLoc')}
                  height={40}
                  style={{ paddingHorizontal: 14 }}
                  onPress={async () => {
                    const p = device ?? (await refresh());
                    if (p) setForm((x) => ({ ...x, location: p }));
                  }}
                />
              </View>
            </View>
          </Card>

          <AlertsCard title={t('fields.previewTitle')} input={form.location ? { location: form.location, crop: form.crop, stage: form.stage } : null} />

          <View style={{ gap: 10 }}>
            <CzButton label={t('fields.save')} icon="check" onPress={() => void save()} busy={add.isPending || update.isPending} disabled={!form.location} />
            <GhostButton label={t('fields.cancel')} onPress={() => setMode('view')} />
            {mode === 'edit' ? <GhostButton label={t('fields.remove')} color={B.red} onPress={() => void del()} disabled={remove.isPending} /> : null}
          </View>
        </>
      ) : fieldsQ.isPending ? (
        <SkeletonCard lines={3} />
      ) : fieldsQ.isError ? (
        <ErrorState error={fieldsQ.error} onRetry={() => void fieldsQ.refetch()} />
      ) : !sel ? (
        <>
          <EmptyState icon={TI.plant} title={t('fields.noFields')} sub={session.isGuest ? t('fields.guestNote') : t('fields.noFieldsSub')} action={t('fields.addBtn')} onAction={startAdd} />
          <AlertsCard title={t('fields.previewTitle')} input={alertsInput(null, focus ?? null)} />
        </>
      ) : (
        <>
          {/* Field list */}
          <Card pad={16} gap={0} style={{ paddingVertical: 6 }} label={t('fields.myFields')}>
            {fields.map((fl, i) => {
              const on = sel.id === fl.id;
              const line = i < fields.length - 1 && !on && fields[i + 1]?.id !== sel.id;
              const meta = [fl.area ? `${f.dec(fl.area, 1)} ${t('fields.acresW')}` : null, t(`crop.${fl.crop}`)].filter(Boolean).join(' · ');
              return (
                <Tap
                  key={fl.id}
                  role="radio"
                  selected={on}
                  label={`${fl.name}, ${meta}, ${t(`stage.${fl.stage}`)}`}
                  onPress={() => pick(fl)}
                  style={{
                    marginHorizontal: -8,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    borderRadius: 16,
                    backgroundColor: on ? c.limeSoft : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: line ? c.line : 'transparent',
                  }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon d={TI.plant} size={20} sw={1.7} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={14} w={600} lines={1}>
                      {fl.name}
                    </Txt>
                    <Txt size={12} dim num lines={1}>
                      {meta}
                    </Txt>
                  </View>
                  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: on ? B.lime : c.soft }}>
                    <Txt size={11} w={600} color={on ? B.limeInk : c.ink} lines={1}>
                      {t(`stage.${fl.stage}`)}
                    </Txt>
                  </View>
                </Tap>
              );
            })}
          </Card>

          <FieldWeather field={sel} />
          <AlertsCard title={t('fields.alertsFor')} input={{ location: sel.location, crop: sel.crop, stage: sel.stage }} fieldId={sel.id} />
          <GhostButton label={`${t('fields.edit')} · ${sel.name}`} onPress={() => startEdit(sel)} />
        </>
      )}
    </Screen>
  );
}

function ChipGroup<V extends string>({ label, options, value, onChange }: { label: string; options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { c } = useCz();
  return (
    <View style={{ gap: 8 }} role="radiogroup" label={label}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Tap
              key={o.value}
              role="radio"
              selected={on}
              label={o.label}
              haptic
              onPress={() => onChange(o.value)}
              style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? B.lime : c.soft, justifyContent: 'center' }}>
              <Txt size={13} w={600} color={on ? B.limeInk : c.ink}>
                {o.label}
              </Txt>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

/** Navy "Field weather" card for the selected field. */
function FieldWeather({ field }: { field: FarmField }) {
  const { f } = useCz();
  const t = useTranslations('farm.fields');
  const q = useConditions(field.location);
  if (q.isPending) return <SkeletonCard lines={3} height={230} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />;
  const d = q.data;
  const rain48 = d.forecast.slice(0, 2).reduce((a, x) => a + x.rain_mm, 0);
  const tiles: [string, string][] = [
    [t('hum'), f.pct(d.humidity)],
    [t('windL'), `${f.loc(Math.round(d.wind_kmh))} km/h`],
    [t('rain48'), `${f.dec(rain48, rain48 < 10 ? 1 : 0)} ${t('mm')}`],
  ];
  return (
    <View style={{ backgroundColor: B.navy, borderRadius: 28, padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0, gap: 4 }}>
          <Label color={B.lime}>{t('weather')}</Label>
          <Txt size={16} w={600} color={B.white}>
            {field.name}
          </Txt>
          <Txt size={11.5} color="rgba(255,255,255,0.75)" num>
            {f.time(d.time)}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Txt size={46} num color={B.white} style={{ lineHeight: 50, letterSpacing: -1.3 }}>
            {f.deg(d.air_c)}
          </Txt>
          <Txt size={12} color="rgba(255,255,255,0.85)" lines={1}>
            {`${t('feelsL')} ${f.deg(d.feels_c)}`}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {tiles.map(([label, val]) => (
          <View
            key={label}
            style={{ flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', gap: 3 }}>
            <Txt size={10.5} color="rgba(255,255,255,0.75)" lines={1} center>
              {label}
            </Txt>
            <Txt size={13} w={600} color={B.white} num lines={1} center>
              {val}
            </Txt>
          </View>
        ))}
      </View>
      <DayStrip days={d.forecast.slice(0, 5)} navy />
      <SourceChips meta={d.meta} tone="glass" />
    </View>
  );
}

/** Alerts for a crop/stage/place (saved field or live preview). */
function AlertsCard({ title, input, fieldId }: { title: string; input: Parameters<typeof useFarmAlerts>[0]; fieldId?: string }) {
  const { f } = useCz();
  const t = useTranslations('farm.fields');
  const q = useFarmAlerts(input);
  const alerts = sortAlerts(q.data?.alerts ?? []);
  return (
    <Card gap={12}>
      <Label>{q.data ? `${title} · ${f.loc(alerts.length)}` : title}</Label>
      {!input ? null : q.isPending ? (
        <SkeletonText lines={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : alerts.length ? (
        alerts.map((a) => <AlertRow key={a.id} alert={a} fieldId={fieldId} />)
      ) : (
        <View style={{ padding: 12, borderRadius: 16, backgroundColor: 'var(--cz-lime-soft)' }}>
          <Txt size={12.5}>{t('noAlerts')}</Txt>
        </View>
      )}
      {q.data ? <SourceChips meta={q.data.meta} /> : null}
    </Card>
  );
}
