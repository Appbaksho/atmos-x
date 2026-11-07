'use client';
/**
 * S28 · Add sensor (prompt-v1 §7.8): pick a build, indoor/outdoor, name it, pass the placement check,
 * then register it. The API returns an ingest token once; this screen shows it with a curl example
 * the device (or a person) uses to send readings. Nothing is simulated. Guests get the account sheet.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  AQI_COLORS,
  B,
  Card,
  Field,
  go,
  I,
  Label,
  Note,
  OptionRow,
  R,
  requireAccount,
  Screen,
  ScreenHeader,
  Seg,
  Spinner,
  Tap,
  toast,
  Txt,
  useCz,
  useLocation,
  View,
} from '@/components/cz';
import { useAddSensor, useSession } from '@/lib/data/hooks';
import type { NewSensor } from '@/lib/data/types';

const BUILDS = ['esp32', 'sc', 'purple', 'existing'] as const;
type Answer = boolean | null;

export function AddSensorScreen() {
  const { c } = useCz();
  const t = useTranslations('air');
  const { focus, device } = useLocation();
  const session = useSession();
  const add = useAddSensor();
  const [build, setBuild] = useState<(typeof BUILDS)[number]>('esp32');
  const [io, setIo] = useState<'outd' | 'ind'>('outd');
  const [name, setName] = useState('');
  const [ans, setAns] = useState<Answer[]>([null, null, null]);
  const [created, setCreated] = useState<NewSensor | null>(null);

  const answer = (i: number, v: boolean) => setAns((a) => a.map((x, k) => (k === i ? v : x)));
  const ready = io === 'ind' || ans.every((a) => a !== null);
  const questions = [t('q1'), t('q2'), t('q3')];

  const start = async () => {
    if (session.isGuest) return requireAccount(t('addSensorFeature'));
    try {
      const s = await add.mutateAsync({
        name: name.trim() || t('namePh'),
        location: device ?? focus ?? null,
        model: `${t(`builds.${build}.name`)} · ${io === 'outd' ? t('outd') : t('ind')}`,
      });
      toast(t('saved'), { tone: 'success' });
      setCreated(s);
    } catch {
      /* GuestRestrictedError opens the account sheet globally */
    }
  };

  if (created) {
    const curl = `curl -X POST ${created.ingest_url} \\\n  -H "X-Sensor-Token: ${created.token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"pm25": 42.0}'`;
    return (
      <Screen>
        <ScreenHeader title={t('tokenTitle')} sub={t('tokenSub', { name: created.name })} />
        <Card gap={10}>
          <Label>{t('tokenLabel')}</Label>
          <Txt size={13} w={600} num selectable style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }}>
            {created.token}
          </Txt>
          <Note tone="danger" icon={I.warn}>
            {t('tokenOnce')}
          </Note>
        </Card>
        <Card gap={10}>
          <Label>{t('curlLabel')}</Label>
          <pre dir="ltr" style={{ margin: 0, padding: 12, borderRadius: 12, backgroundColor: c.soft, fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{curl}</pre>
          <Txt size={11.5} dim>
            {t('curlNote')}
          </Txt>
          <Tap
            label={t('copy')}
            onPress={() => void navigator.clipboard?.writeText(curl).then(() => toast(t('copied'), { tone: 'success' }))}
            style={{ alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: B.lime, justifyContent: 'center' }}>
            <Txt size={13} w={600} color={B.limeInk}>
              {t('copy')}
            </Txt>
          </Tap>
        </Card>
        <Tap label={t('done')} onPress={() => go('S27')} style={{ minHeight: 48, borderRadius: R.pill, backgroundColor: c.solid, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={14} w={600} color={c.onSolid}>
            {t('done')}
          </Txt>
        </Tap>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('addTitle')} sub={t('addSub')} />
      <Note icon={I.info}>{t('realNote')}</Note>

      {/* 1 · Build */}
      <View style={{ gap: 8 }} role="radiogroup" label={t('step1')}>
        <Label style={{ paddingHorizontal: 4 }}>{t('step1')}</Label>
        {BUILDS.map((b) => (
          <OptionRow key={b} title={t(`builds.${b}.name`)} sub={t(`builds.${b}.parts`)} extra={t(`builds.${b}.best`)} selected={build === b} onPress={() => setBuild(b)} />
        ))}
      </View>

      {/* 2 · Indoor / outdoor */}
      <Card gap={12}>
        <Label>{t('step2')}</Label>
        <Seg
          label={t('step2')}
          options={[
            { label: t('outd'), value: 'outd' as const },
            { label: t('ind'), value: 'ind' as const },
          ]}
          value={io}
          onChange={setIo}
        />
        <Txt size={12} dim style={{ lineHeight: 17 }}>
          {io === 'outd' ? t('outNote') : t('inNote')}
        </Txt>
      </Card>

      {/* 3 · Name */}
      <Card gap={12}>
        <Label>{t('step3')}</Label>
        <Field label={t('nameL')} value={name} onChangeText={(v: string) => setName(v)} placeholder={t('namePh')} maxLength={40} />
      </Card>

      {/* 4 · Placement (outdoor) */}
      {io === 'outd' ? (
        <Card gap={12}>
          <Label>{t('step4')}</Label>
          {questions.map((q, i) => (
            <View key={q} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Txt size={13} style={{ flex: 1, lineHeight: 18 }}>
                {q}
              </Txt>
              <View role="radiogroup" label={q} style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: R.pill, backgroundColor: c.soft }}>
                <YesNo label={t('yes')} on={ans[i] === true} bg={B.lime} fg={B.limeInk} onPress={() => answer(i, true)} />
                <YesNo label={t('no')} on={ans[i] === false} bg={AQI_COLORS[2]} fg={B.navy} onPress={() => answer(i, false)} />
              </View>
            </View>
          ))}
          <Txt size={11.5} dim style={{ lineHeight: 17 }}>
            {t('placeNote')}
          </Txt>
        </Card>
      ) : null}

      <Tap
        label={ready ? t('start') : t('startOff')}
        haptic
        disabled={!ready || add.isPending}
        onPress={() => void start()}
        style={{ height: 56, borderRadius: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: ready ? B.lime : c.soft, flexDirection: 'row', gap: 8 }}>
        {add.isPending ? <Spinner color={B.limeInk} /> : null}
        <Txt size={15} w={600} color={ready ? B.limeInk : c.ink2}>
          {ready ? t('start') : t('startOff')}
        </Txt>
      </Tap>
      <Txt size={11.5} dim center style={{ lineHeight: 17, paddingHorizontal: 8 }}>
        {t('privNote')}
      </Txt>
    </Screen>
  );
}

function YesNo({ label, on, bg, fg, onPress }: { label: string; on: boolean; bg: string; fg: string; onPress: () => void }) {
  const { c } = useCz();
  return (
    <Tap role="radio" selected={on} label={label} haptic onPress={onPress} style={{ minHeight: 36, minWidth: 44, paddingHorizontal: 12, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? bg : 'transparent' }}>
      <Txt size={12} w={600} color={on ? fg : c.ink2}>
        {label}
      </Txt>
    </Tap>
  );
}
