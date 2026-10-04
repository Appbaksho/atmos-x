/** S28 · Add sensor — pick a build, indoor/outdoor, copy keys, pass the placement check, start the 7-day check. */
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Card, I, Icon, Label, OptionRow, Screen, ScreenHeader, Seg, Tap, Txt } from '@/components/cz/ui';
import { AQI_COLORS, B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go } from '@/lib/cz/routes';
import { AIR_T } from './i18n';

const DEVICE_ID = 'atx-dev-7f3a91';
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

type Answer = boolean | null;

export default function AddSensor() {
  const { c, f } = useCz();
  const t = f.pick(AIR_T);
  const [build, setBuild] = useState(0);
  const [io, setIo] = useState<'outd' | 'ind'>('outd');
  const [copied, setCopied] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [ans, setAns] = useState<Answer[]>([null, null, null]);

  const keys: [string, string][] = [
    [
      ['Device ID', DEVICE_ID],
      ['Device key', 'dk_••••••••••••4c2e'],
      ['HTTPS', 'POST https://api.atmosx.app/v1/devices/' + DEVICE_ID + '/readings'],
      ['MQTT (TLS)', 'atmosx/devices/' + DEVICE_ID + '/readings'],
    ],
    [
      ['Device ID', DEVICE_ID],
      ['airrohr → Custom API', 'Server api.atmosx.app · Path /v1/airrohr/' + DEVICE_ID + ' · Port 443 · HTTPS on'],
      ['Device key', 'dk_••••••••••••4c2e'],
    ],
    [
      ['PurpleAir sensor index', t.purpleIdx],
      ['Read key', t.purpleKey],
    ],
    [
      ['Sensor.Community ID', t.scId],
      ['Access', 'Read-only'],
    ],
  ][build] as [string, string][];

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(keys.map(([l, v]) => `${l}: ${v}`).join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const answer = (i: number, v: boolean) => setAns((a) => a.map((x, k) => (k === i ? v : x)));
  const ready = photo && ans.every((a) => a !== null);
  const questions = [t.q1, t.q2, t.q3];

  return (
    <Screen>
      <ScreenHeader title={t.addTitle} sub={t.addSub} />

      {/* 1 · Build */}
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        <Label style={{ paddingHorizontal: 4 }}>{t.step1}</Label>
        {t.builds.map(([name, parts, best], i) => (
          <OptionRow
            key={name}
            title={name}
            sub={parts}
            extra={best}
            selected={build === i}
            onPress={() => {
              setBuild(i);
              setCopied(false);
            }}
          />
        ))}
      </View>

      {/* 2 · Indoor / outdoor */}
      <Card gap={12}>
        <Label>{t.step2}</Label>
        <Seg
          options={[
            { label: t.outd, value: 'outd' as const },
            { label: t.ind, value: 'ind' as const },
          ]}
          value={io}
          onChange={setIo}
        />
        <Txt size={12} dim style={{ lineHeight: 17 }}>
          {io === 'outd' ? t.outNote : t.inNote}
        </Txt>
      </Card>

      {/* 3 · Keys */}
      <Card tone="navy" gap={10}>
        <Label color={B.lime}>{t.step3}</Label>
        {keys.map(([label, val]) => (
          <View key={label} style={styles.key}>
            <Txt size={10.5} color="rgba(255,255,255,0.7)">
              {label}
            </Txt>
            <Txt size={12.5} w={500} color={B.white} selectable style={{ fontFamily: MONO }}>
              {val}
            </Txt>
          </View>
        ))}
        <Tap label={copied ? t.copied : t.copy} haptic onPress={copy} style={styles.copy}>
          <Icon d={copied ? I.check : I.copy} size={16} color={B.limeInk} sw={2} />
          <Txt size={12.5} w={600} color={B.limeInk}>
            {copied ? t.copied : t.copy}
          </Txt>
        </Tap>
      </Card>

      {/* 4 · Placement */}
      <Card gap={12}>
        <Label>{t.step4}</Label>
        <Tap
          role="checkbox"
          selected={photo}
          label={photo ? t.photoOk : t.photo}
          haptic
          onPress={() => setPhoto(!photo)}
          style={[styles.photo, { borderColor: c.line, backgroundColor: photo ? c.limeSoft : 'transparent' }]}>
          <Icon d={photo ? I.check : I.camera} size={18} sw={2} />
          <Txt size={13} w={600}>
            {photo ? t.photoOk : t.photo}
          </Txt>
        </Tap>
        {questions.map((q, i) => (
          <View key={q} style={styles.q}>
            <Txt size={13} style={{ flex: 1, lineHeight: 18 }}>
              {q}
            </Txt>
            <View style={[styles.yn, { backgroundColor: c.soft }]} accessibilityRole="radiogroup" accessibilityLabel={q}>
              <YesNo label={t.yes} on={ans[i] === true} bg={B.lime} fg={B.limeInk} onPress={() => answer(i, true)} />
              <YesNo label={t.no} on={ans[i] === false} bg={AQI_COLORS[2]} fg={B.navy} onPress={() => answer(i, false)} />
            </View>
          </View>
        ))}
        <Txt size={11.5} dim style={{ lineHeight: 17 }}>
          {t.placeNote}
        </Txt>
      </Card>

      {ready ? (
        <Tap label={t.start} haptic onPress={() => go('S27')} style={[styles.start, { backgroundColor: B.lime }]}>
          <Txt size={15} w={600} color={B.limeInk}>
            {t.start}
          </Txt>
        </Tap>
      ) : (
        <View accessible accessibilityRole="button" accessibilityLabel={t.startOff} accessibilityState={{ disabled: true }} style={[styles.start, { backgroundColor: c.soft }]}>
          <Txt size={15} w={600} color={c.ink2}>
            {t.startOff}
          </Txt>
        </View>
      )}
      <Txt size={11.5} dim center style={{ lineHeight: 17, paddingHorizontal: 8 }}>
        {t.privNote}
      </Txt>
    </Screen>
  );
}

function YesNo({ label, on, bg, fg, onPress }: { label: string; on: boolean; bg: string; fg: string; onPress: () => void }) {
  const { c } = useCz();
  return (
    <Tap role="radio" selected={on} label={label} haptic hitSlop={6} onPress={onPress} style={[styles.ynBtn, { backgroundColor: on ? bg : 'transparent' }]}>
      <Txt size={12} w={600} color={on ? fg : c.ink2}>
        {label}
      </Txt>
    </Tap>
  );
}

const styles = StyleSheet.create({
  key: { gap: 3, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  copy: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: B.lime },
  photo: { height: 46, borderRadius: R.pill, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  q: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  yn: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: R.pill },
  ynBtn: { height: 32, paddingHorizontal: 12, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  start: { height: 56, borderRadius: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
