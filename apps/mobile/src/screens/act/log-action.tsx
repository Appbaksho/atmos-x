/**
 * S14 · Log an action (full-screen modal). Live camera viewfinder when permission is granted
 * (expo-camera CameraView); otherwise the prototype's sapling photo with an "Allow camera" pill.
 * Bottom sheet: action type, species, quantity, credit, submit.
 */
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CzButton, I, Icon, IconBtn, Label, LightStatusBar, OptionRow, Photo, Screen, Stepper, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { PHOTO } from '@/lib/cz/demo';
import { go, goBack } from '@/lib/cz/routes';

const T = {
  en: {
    sealed: 'GPS + time sealed', noGallery: 'No gallery', captured: 'Photo captured · location and time sealed into it', action: 'Action', acts: ['Tree', 'Roof coat', 'Climber', 'Watering'],
    speciesL: 'Species', qty: 'Quantity', credit: 'Who gets credit', submit: 'Submit for verification', cMe: 'Just me', cTeam: 'Hall Rooftop Crew', cOrg: 'DU Green Society',
    allow: 'Allow camera', shutter: 'Take photo', flip: 'Flip camera', close: 'Close',
  },
  bn: { action: 'কাজ', acts: ['গাছ', 'ছাদ রং', 'লতা', 'পানি'], speciesL: 'প্রজাতি', qty: 'সংখ্যা', credit: 'কৃতিত্ব কে পাবে', submit: 'যাচাইয়ের জন্য জমা দিন', cMe: 'শুধু আমি' },
  ur: { action: 'کام', acts: ['درخت', 'چھت کوٹ', 'بیل', 'پانی'], speciesL: 'نوع', qty: 'تعداد', credit: 'کریڈٹ کسے ملے', submit: 'تصدیق کے لیے بھیجیں', cMe: 'صرف میں' },
};

/** Action icons: tree, roof coat, climber, watering. */
const AI = [I.tree, I.roof, I.climber, I.drop];
/** What each action type can log (first entry is the prototype default). */
const SPC = [
  ['Neem · Azadirachta indica', 'Krishnachura · Delonix regia', 'Arjun · Terminalia arjuna'],
  ['Cool-roof coating · white elastomeric', 'Roof lime-wash · white'],
  ['Madhabilata · Hiptage benghalensis'],
  ['Neem · Azadirachta indica', 'Krishnachura · Delonix regia'],
];
const UNITS: [string, string][] = [['tree', 'trees'], ['m²', 'm²'], ['plant', 'plants'], ['tree watered', 'trees watered']];

export default function LogAction() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [shot, setShot] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [act, setAct] = useState(0);
  const [spIdx, setSpIdx] = useState(0);
  const [qty, setQty] = useState(3);
  const [cred, setCred] = useState(1);

  const web = Platform.OS === 'web';
  const live = !web && !!permission?.granted;
  const vfH = Math.round(Math.max(420, Math.min(600, winH * 0.64)));

  const shoot = async () => {
    if (live && cam.current) {
      try {
        const pic = await cam.current.takePictureAsync({ quality: 0.7 });
        if (pic?.uri) setUri(pic.uri);
      } catch {
        // capture failed (camera not ready) — still mark the shot so the flow can continue
      }
    }
    setShot(true);
  };

  const askCamera = () => {
    if (permission && !permission.canAskAgain) Linking.openSettings().catch(() => {});
    else requestPermission().catch(() => {});
  };

  const n = act === 1 ? qty * 40 : qty;
  const unit = UNITS[act];
  const species = SPC[act][spIdx] ?? SPC[act][0];
  const speciesRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 12, minHeight: 44, borderBottomWidth: 1, borderBottomColor: c.line };
  const credits: [string, string][] = [
    [t.cMe, 'Points go to your profile'],
    [t.cTeam, 'Team goal · ' + f.dC(-1.5) + ' by Oct 2027'],
    [t.cOrg, f.loc('Counts for all 4 teams')],
  ];

  return (
    <Screen bleed gap={0}>
      <LightStatusBar />
      <View style={{ height: vfH, overflow: 'hidden', backgroundColor: '#000' }}>
        {live ? (
          <>
            <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={facing} mode="picture" />
            {uri ? <Photo src={uri} style={StyleSheet.absoluteFill} label="Captured photo" /> : null}
          </>
        ) : (
          <Photo src={PHOTO.sapling()} style={StyleSheet.absoluteFill} label="Camera viewfinder showing a sapling" />
        )}
        <LinearGradient
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
          locations={[0, 0.26, 0.7, 1]}
        />
        {/* Lime framing brackets (prototype: 70/120 px in a 402 × 560 frame) */}
        <Bracket top="21.4%" start="17.4%" edges={['top', 'start']} />
        <Bracket top="21.4%" end="17.4%" edges={['top', 'end']} />
        <Bracket bottom="23.2%" start="17.4%" edges={['bottom', 'start']} />
        <Bracket bottom="23.2%" end="17.4%" edges={['bottom', 'end']} />

        <View style={{ position: 'absolute', top: insets.top + 12, start: 16, end: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <IconBtn d={I.close} label={t.close} tone="glass" onPress={goBack} />
          <View style={{ height: 34, paddingHorizontal: 12, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,24,46,0.55)', borderWidth: 1, borderColor: 'rgba(172,236,0,0.6)' }}>
            <Icon d={I.lock} size={14} color={B.lime} sw={2} />
            <Txt size={12} w={600} color={B.lime}>
              {t.sealed}
            </Txt>
          </View>
        </View>

        {!web && !live && permission ? (
          <View style={{ position: 'absolute', top: insets.top + 68, start: 0, end: 0, alignItems: 'center' }}>
            <Tap label={t.allow} haptic onPress={askCamera} style={{ height: 36, paddingHorizontal: 14, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: B.glass, borderWidth: 1, borderColor: B.glassLine }}>
              <Icon d={I.camera} size={16} color={B.white} sw={2} />
              <Txt size={12.5} w={600} color={B.white}>
                {t.allow}
              </Txt>
            </Tap>
          </View>
        ) : null}

        <View pointerEvents="none" style={{ position: 'absolute', start: 16, end: 16, bottom: 120, alignItems: 'center' }}>
          <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)' }}>
            <Txt size={11.5} w={500} num color={B.white} style={f.lang === 'en' ? { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) } : undefined}>
              {f.loc('23.7629° N, 90.3601° E ± 4 m · 2 Oct 2026, 14:32')}
            </Txt>
          </View>
        </View>

        <View style={{ position: 'absolute', start: 0, end: 0, bottom: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 40 }}>
          <View accessible accessibilityLabel={t.noGallery} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center', padding: 2 }}>
            <Txt size={9.5} center color="rgba(255,255,255,0.75)" style={{ lineHeight: 11 }}>
              {t.noGallery}
            </Txt>
          </View>
          <Tap label={t.shutter} haptic onPress={shoot} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: B.white, padding: 4 }}>
            <View style={{ flex: 1, borderRadius: 30, backgroundColor: shot ? B.lime : B.white }} />
          </Tap>
          <IconBtn d={I.flip} label={t.flip} tone="glass" iconSize={20} onPress={() => setFacing((x) => (x === 'back' ? 'front' : 'back'))} style={{ borderWidth: 0 }} />
        </View>
      </View>

      <View style={{ marginTop: -24, backgroundColor: c.bg, borderTopStartRadius: R.xxl, borderTopEndRadius: R.xxl, paddingTop: 18, paddingHorizontal: 16, gap: 14 }}>
        {shot ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.limeSoft }}>
            <Icon d={I.check} size={16} sw={2.4} />
            <Txt size={12.5} w={600} style={{ flex: 1 }}>
              {t.captured}
            </Txt>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Label>{t.action}</Label>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
            {t.acts.map((label, i) => {
              const on = act === i;
              return (
                <Tap
                  key={label}
                  role="radio"
                  selected={on}
                  label={label}
                  haptic
                  onPress={() => {
                    setAct(i);
                    setSpIdx(0);
                  }}
                  style={{ flex: 1, minWidth: 0, height: 64, borderRadius: R.md, backgroundColor: on ? B.lime : c.card, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Icon d={AI[i]} size={20} sw={1.7} color={on ? B.limeInk : c.ink} />
                  <Txt size={11.5} w={600} lines={1} color={on ? B.limeInk : c.ink}>
                    {label}
                  </Txt>
                </Tap>
              );
            })}
          </View>
        </View>

        <View style={{ backgroundColor: c.card, borderRadius: 22, paddingVertical: 4, paddingHorizontal: 16 }}>
          {SPC[act].length > 1 ? (
            <Tap label={`${t.speciesL}: ${species}`} onPress={() => setSpIdx((i) => (i + 1) % SPC[act].length)} style={speciesRow}>
              <SpeciesValue label={t.speciesL} value={species} />
              <Icon d={I.chevDown} size={16} sw={2} />
            </Tap>
          ) : (
            <View style={speciesRow}>
              <SpeciesValue label={t.speciesL} value={species} />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={11.5} dim>
                {t.qty}
              </Txt>
              <Txt size={14} w={600} num>
                {f.loc(n) + ' ' + (n === 1 ? unit[0] : unit[1])}
              </Txt>
            </View>
            <Stepper value={f.loc(n)} label={t.qty} onDec={() => setQty((q) => Math.max(1, q - 1))} onInc={() => setQty((q) => Math.min(99, q + 1))} />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Label>{t.credit}</Label>
          <View accessibilityRole="radiogroup" style={{ gap: 6 }}>
            {credits.map(([label, sub], i) => (
              <OptionRow key={label} title={label} sub={sub} selected={cred === i} onPress={() => setCred(i)} />
            ))}
          </View>
        </View>

        <CzButton label={t.submit} icon="check" onPress={() => go('S15')} />
      </View>
    </Screen>
  );
}

function SpeciesValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Txt size={11.5} dim>
        {label}
      </Txt>
      <Txt size={14} w={600}>
        {value}
      </Txt>
    </View>
  );
}

/** One L-shaped viewfinder corner (30 × 30, 3 pt lime stroke). */
function Bracket({ top, bottom, start, end, edges }: { top?: `${number}%`; bottom?: `${number}%`; start?: `${number}%`; end?: `${number}%`; edges: ['top' | 'bottom', 'start' | 'end'] }) {
  const [v, h] = edges;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        bottom,
        start,
        end,
        width: 30,
        height: 30,
        borderColor: B.lime,
        borderTopWidth: v === 'top' ? 3 : 0,
        borderBottomWidth: v === 'bottom' ? 3 : 0,
        borderStartWidth: h === 'start' ? 3 : 0,
        borderEndWidth: h === 'end' ? 3 : 0,
        borderTopStartRadius: v === 'top' && h === 'start' ? 2 : 0,
        borderTopEndRadius: v === 'top' && h === 'end' ? 2 : 0,
        borderBottomStartRadius: v === 'bottom' && h === 'start' ? 2 : 0,
        borderBottomEndRadius: v === 'bottom' && h === 'end' ? 2 : 0,
      }}
    />
  );
}
