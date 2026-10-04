/** S19 · Create & invite (modal) — team name, team size vs feasibility, invite by link / QR / code. */
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Card, CzButton, Field, I, Icon, Label, Note, Screen, ScreenHeader, Seg, Stepper, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { ROUTES } from '@/lib/cz/routes';

import { INVITE_CODE, INVITE_SHORT, INVITE_URL, MONO, QR, QR_N, T } from './data';

export default function CreateTeam() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const [name, setName] = useState('');
  const [size, setSize] = useState(6);
  const [inv, setInv] = useState(0);
  const [copied, setCopied] = useState(false);

  const warn = size < 6 || size > 8;
  const warnText = size < 6 ? t.warnSmall(f.loc(Math.round(12 / size))) : t.warnBig;

  const copy = () => {
    Clipboard.setStringAsync(INVITE_URL).catch(() => {});
    setCopied(true);
  };

  // Land on the new team's dashboard; replacing the modal keeps Back from reopening the form.
  const create = () => router.replace(ROUTES.S17 as Href);

  return (
    <Screen>
      <ScreenHeader title={t.newTeam} sub={t.goalLine(f.dC(-1.5))} />

      {/* Name + size */}
      <Card gap={14}>
        <Field label={t.teamName} value={name} onChangeText={setName} placeholder={t.placeholder} returnKeyType="done" autoCapitalize="words" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Label>{t.size}</Label>
            <Txt size={12} dim>
              {t.sizeNote}
            </Txt>
          </View>
          <Stepper value={f.loc(size)} label={t.size} onDec={() => setSize((s) => Math.max(2, s - 1))} onInc={() => setSize((s) => Math.min(20, s + 1))} />
        </View>
        {warn ? (
          <View accessibilityLiveRegion="polite">
            <Note>
              <Txt size={12}>{warnText}</Txt>
            </Note>
          </View>
        ) : null}
      </Card>

      {/* Invite */}
      <Card gap={14}>
        <Label>{t.inviteBy}</Label>
        <Seg value={inv} onChange={setInv} options={t.inv.map((label, i) => ({ label, value: i }))} />

        {inv === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, paddingStart: 14, borderRadius: 18, backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.line }}>
            <Txt size={13.5} w={500} lines={1} selectable accessibilityRole="text" style={{ flex: 1, minWidth: 0, fontFamily: MONO, writingDirection: 'ltr' }}>
              {INVITE_SHORT}
            </Txt>
            <Tap
              label={copied ? t.copied : `${t.copy} ${t.linkA11y}`}
              haptic
              onPress={copy}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityLiveRegion="polite"
              style={{ height: 40, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: copied ? B.lime : B.navy, justifyContent: 'center' }}>
              <Txt size={13} w={600} lines={1} color={copied ? B.limeInk : B.white}>
                {copied ? t.copied : t.copy}
              </Txt>
            </Tap>
          </View>
        ) : null}

        {inv === 1 ? (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View accessible accessibilityRole="image" accessibilityLabel={t.qrA11y} style={{ padding: 14, borderRadius: R.lg, backgroundColor: B.white }}>
              <Svg width={168} height={168} viewBox={`0 0 ${QR_N} ${QR_N}`}>
                {QR.map(({ x, y }) => (
                  <Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={B.navy} />
                ))}
              </Svg>
            </View>
          </View>
        ) : null}

        {inv === 2 ? (
          <View
            accessible
            accessibilityLabel={`${t.codeA11y}: ${INVITE_CODE.split('').join(' ')}`}
            style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8, direction: 'ltr' }}>
            {INVITE_CODE.split('').map((ch, i) => (
              <View key={i} style={{ flex: 1, maxWidth: 38, height: 52, borderRadius: R.sm, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={22} w={600} style={{ fontFamily: MONO, fontWeight: '600' }}>
                  {f.loc(ch)}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon d={I.clock} size={14} sw={2} color={c.ink2} />
          <Txt size={12} dim style={{ flex: 1 }}>
            {f.loc(t.expires)}
          </Txt>
        </View>
      </Card>

      <CzButton label={t.create} icon="check" onPress={create} />
    </Screen>
  );
}
