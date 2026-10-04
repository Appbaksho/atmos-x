'use client';
/**
 * S28 · Add sensor (V0-7): pick a build, indoor/outdoor, name it, pass the placement check, then
 * start the 7-day check. In v0 the device is simulated (useAddSensor stores it on this device and
 * readings follow the area PM2.5); that is said on screen. Guests get the account sheet.
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

  const answer = (i: number, v: boolean) => setAns((a) => a.map((x, k) => (k === i ? v : x)));
  const ready = io === 'ind' || ans.every((a) => a !== null);
  const questions = [t('q1'), t('q2'), t('q3')];

  const start = async () => {
    if (session.isGuest) return requireAccount(t('addSensorFeature'));
    try {
      await add.mutateAsync({
        name: name.trim() || t('namePh'),
        location: device ?? focus ?? null,
        model: `${t(`builds.${build}.name`)} · ${io === 'outd' ? t('outd') : t('ind')}`,
      });
      toast(t('saved'), { tone: 'success' });
      go('S27');
    } catch {
      /* GuestRestrictedError opens the account sheet globally */
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('addTitle')} sub={t('addSub')} />
      <Note icon={I.info}>{t('simNote')}</Note>

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
