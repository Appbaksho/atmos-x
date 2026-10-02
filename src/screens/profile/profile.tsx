/** S20 · Profile — points, badges, clans, contribution map, sensors, My trees (+ add-tree flow), history. */
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';

import { Avatar, Bar, Card, Icon, IconBtn, I, ListRow, Photo, Screen, SectionTitle, Tag, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { PHOTO, USER, type MyTree } from '@/lib/cz/demo';
import { go, goPath, type ScreenId } from '@/lib/cz/routes';

import { addDays, fmtD, mtCopy, SPECIES_KEYS, TODAY_ISO, treeName, treeStatus } from './trees-common';

const T = {
  en: { points: 'Points', badges: 'Badges', myMap: 'My contribution map', snapNote: 'Snapped to zone centers — your exact spots stay private.', history: 'History', notifs: 'Notifications', settings: 'Settings' },
  bn: { points: 'পয়েন্ট', badges: 'ব্যাজ', history: 'ইতিহাস', notifs: 'বিজ্ঞপ্তি', settings: 'সেটিংস' },
  ur: { points: 'پوائنٹس', badges: 'بیجز', history: 'تاریخ', notifs: 'اطلاعات', settings: 'ترتیبات' },
};

const DEV = {
  en: { title: 'My air sensors', sub: '3 sensors · balcony node is public' },
  bn: { title: 'আমার বাতাস সেন্সর', sub: '৩টি সেন্সর · বারান্দার নোড পাবলিক' },
  ur: { title: 'میرے ہوا سینسر', sub: '۳ سینسر · بالکونی نوڈ عوامی' },
};

const NM = {
  en: { nmL: 'Tree name', nmPh: 'e.g. Shanti', regNote: 'Registered with an ID like ATX-26-0006 when saved', prev: 'Previous day', next: 'Next day' },
  bn: { nmL: 'গাছের নাম', nmPh: 'যেমন শান্তি', regNote: 'সংরক্ষণ করলে ATX-26-0006 এর মতো নিবন্ধন নম্বর পাবে' },
  ur: { nmL: 'درخت کا نام', nmPh: 'مثلاً شانتی', regNote: 'محفوظ کرنے پر ATX-26-0006 جیسا رجسٹریشن نمبر ملے گا' },
};

/** Prototype gear (the settings button on S20). */
const GEAR =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.5 7.5 0 0 1-1.9 1.1L15 20.5h-4l-.3-2a7.5 7.5 0 0 1-1.9-1.1l-1.9.7-2-3.4 1.6-1.2a7.6 7.6 0 0 1 0-2.9L3 9.4l2-3.4 1.9.7a7.5 7.5 0 0 1 1.9-1.1L9 3.5h4l.3 2.1a7.5 7.5 0 0 1 1.9 1.1l1.9-.7 2 3.4-1.6 1.2a7.6 7.6 0 0 1 0 2.9z';

const hex = (x: number, y: number, r: number) => {
  const p: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    p.push((x + r * Math.cos(a)).toFixed(1) + ',' + (y + r * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
};
const MY_DOTS = [[110, 80], [190, 100], [250, 60]].map(([x, y]) => ({ x, y, pts: hex(x, y, 24) }));

export default function ProfileScreen() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const dev = f.pick(DEV);
  const loc = f.loc;

  const stats = [
    ['#' + loc(9), 'Mohammadpur'],
    [loc(11) + '/' + loc(12), 'Trees alive'],
    [loc(14), 'Actions'],
  ];
  const badges: [string, string, boolean][] = [
    ['First roof', I.roof, true],
    ['Monsoon planter', I.drop, true],
    ['90-day survivor', I.tree, true],
    ['Team builder', I.community, true],
    ['Heat shield', I.sun, false],
  ];
  const clans: { ini: string; name: string; meta: string; bg: string; fg: string; to: ScreenId }[] = [
    { ini: 'HR', name: 'Hall Rooftop Crew', meta: 'Team · lead · ' + loc(38) + '% of goal', bg: B.lime, fg: B.limeInk, to: 'S17' },
    { ini: 'DU', name: 'DU Green Society', meta: 'Organization · member', bg: B.blue, fg: B.white, to: 'S18' },
  ];
  const history: [string, string, string, string, ScreenId][] = [
    ['3 Neem planted', '2 Oct · Asad Gate · verified', '+' + loc(120), I.tree, 'S15'],
    ['Roof survey', '21 Sep · Hall Rooftop Crew', '+' + loc(60), I.roof, 'S17'],
    ['Day-90 survival photo', '14 Sep · Lalmatia', '+' + loc(40), I.camera, 'S15'],
    ['Joined DU Green Society', '2 Sep', '+' + loc(20), I.community, 'S18'],
  ];

  return (
    <Screen tab>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <IconBtn d={I.bell} iconSize={20} label={t.notifs} badge onPress={() => go('S21')} />
        <IconBtn d={GEAR} iconSize={20} label={t.settings} onPress={() => go('S22')} />
      </View>

      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4 }}>
        <View
          accessible
          accessibilityLabel="Your photo"
          style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: B.lime, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.profile} size={38} color={c.ink2} sw={1.5} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt display size={20} accessibilityRole="header">
            {USER.full}
          </Txt>
          <Txt size={13} dim>
            {'Level ' + loc(7) + ' · Canopy keeper'}
          </Txt>
        </View>
      </View>

      {/* Points */}
      <View style={{ backgroundColor: B.navy, borderRadius: R.xxl, padding: 18, gap: 12, borderWidth: c.dark ? 1 : 0, borderColor: c.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ gap: 2 }}>
            <Txt size={12} color="rgba(255,255,255,0.8)">
              {t.points}
            </Txt>
            <Txt size={40} num color={B.white} style={{ lineHeight: 44, letterSpacing: -0.8 }}>
              {loc('2,340')}
            </Txt>
          </View>
          <Txt size={12} w={600} color={B.lime}>
            {loc(660) + ' to Level ' + loc(8)}
          </Txt>
        </View>
        <Bar pct={78} height={10} color={B.lime} track="rgba(255,255,255,0.14)" />
        <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
          {stats.map(([val, label]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={18} w={600} num color={B.white} lines={1}>
                {val}
              </Txt>
              <Txt size={11} color="rgba(255,255,255,0.75)" lines={1}>
                {label}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      {/* Badges */}
      <View style={{ gap: 10 }}>
        <SectionTitle title={t.badges} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 4 }}>
          {badges.map(([name, icon, got]) => (
            <View
              key={name}
              accessible
              accessibilityLabel={name + (got ? ', earned' : ', locked')}
              style={{ width: 92, alignItems: 'center', gap: 6, opacity: got ? 1 : 0.45 }}>
              <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={64} height={64} style={StyleSheet.absoluteFill}>
                  <Polygon points="32,0 59.5,16 59.5,48 32,64 4.5,48 4.5,16" fill={got ? B.lime : c.soft} />
                </Svg>
                <Icon d={icon} size={26} color={got ? B.limeInk : c.ink2} sw={1.8} />
              </View>
              <Txt size={11.5} w={600} center style={{ lineHeight: 14 }}>
                {name}
              </Txt>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Clans */}
      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        {clans.map((cl, i) => (
          <ListRow key={cl.ini} last={i === clans.length - 1} label={cl.name} onPress={() => go(cl.to)}>
            <Avatar ini={cl.ini} bg={cl.bg} fg={cl.fg} size={40} square />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={14} w={600}>
                {cl.name}
              </Txt>
              <Txt size={11.5} dim>
                {cl.meta}
              </Txt>
            </View>
            <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
          </ListRow>
        ))}
      </Card>

      {/* Contribution map */}
      <Card pad={12} gap={10}>
        <Txt label style={{ paddingHorizontal: 4, paddingTop: 4 }}>
          {t.myMap}
        </Txt>
        <Photo src={PHOTO.basemap(800, 400, '&crop=focalpoint&fp-x=.4&fp-y=.5&fp-z=1.4')} label="Basemap with your contributions" style={{ height: 170, borderRadius: 18 }}>
          <Svg width="100%" height="100%" viewBox="0 0 346 170" style={StyleSheet.absoluteFill} pointerEvents="none">
            {MY_DOTS.map((d) => (
              <Polygon key={d.pts} points={d.pts} fill={B.lime} fillOpacity={0.35} stroke={B.lime} strokeWidth={1.5} />
            ))}
            {MY_DOTS.map((d) => (
              <Circle key={d.x} cx={d.x} cy={d.y} r={5} fill={B.lime} stroke={B.navy} strokeWidth={2} />
            ))}
          </Svg>
        </Photo>
        <Txt size={11.5} dim style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
          {t.snapNote}
        </Txt>
      </Card>

      {/* Air sensors */}
      <Tap label={dev.title} onPress={() => go('S27')} style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.device} size={22} sw={1.7} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={14} w={600}>
            {dev.title}
          </Txt>
          <Txt size={12} dim>
            {dev.sub}
          </Txt>
        </View>
        <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
      </Tap>

      <MyTrees />

      {/* History */}
      <View style={{ gap: 10 }}>
        <SectionTitle title={t.history} />
        <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          {history.map(([title, when, pts, icon, to], i) => (
            <ListRow key={title} last={i === history.length - 1} label={title} onPress={() => go(to)}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={icon} size={18} sw={1.7} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={13.5} w={600}>
                  {title}
                </Txt>
                <Txt size={11.5} dim>
                  {loc(when)}
                </Txt>
              </View>
              <Txt size={12.5} w={600} num color={c.leaf}>
                {pts}
              </Txt>
            </ListRow>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

/* ───────────────────────────── My trees ───────────────────────────── */

function MyTrees() {
  const { c, f, prefs, setPref, font } = useCz();
  const X = mtCopy(prefs.lang);
  const nm = f.pick(NM);
  const loc = f.loc;
  const TR: MyTree[] = prefs.trees ?? [];

  const [adding, setAdding] = useState(false);
  const [pend, setPend] = useState<{ x: number; y: number } | null>(null);
  const [sp, setSp] = useState(0);
  const [date, setDate] = useState(TODAY_ISO);
  const [name, setName] = useState('');
  const [sel, setSel] = useState(-1);
  const [box, setBox] = useState({ w: 1, h: 1 });

  const rows = TR.map((r) => {
    const s = treeStatus(r, X, loc, c);
    return {
      tree: r,
      s,
      name: treeName(r, X),
      meta: (X.sp[r.sp] || r.sp) + ' · ' + (r.loc === 'Pinned on map' ? X.pinned : r.loc) + ' · ' + X.planted + ' ' + fmtD(r.d, loc),
      c: s.urgent ? s.bg : B.lime,
      fg: s.urgent ? s.fg : B.limeInk,
    };
  });

  const open = (r: MyTree) => goPath('/tree/' + r.id);

  const onMap = (e: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (!adding) return;
    const x = Math.max(0, Math.min(100, (e.nativeEvent.locationX / box.w) * 100));
    const y = Math.max(0, Math.min(100, (e.nativeEvent.locationY / box.h) * 100));
    setPend({ x: +x.toFixed(1), y: +y.toFixed(1) });
  };

  const save = () => {
    if (!pend) return;
    const k = SPECIES_KEYS[sp];
    const n = TR.length + 1;
    const tree: MyTree = {
      name: name.trim() || X.sp[k] + ' ' + n,
      id: 'ATX-26-' + String(n).padStart(4, '0'),
      sp: k,
      loc: 'Pinned on map',
      d: date || TODAY_ISO,
      ph: date || TODAY_ISO,
      x: pend.x,
      y: pend.y,
    };
    setPref('trees', [...TR, tree]);
    setAdding(false);
    setPend(null);
    setSel(TR.length);
    setName('');
  };

  const field = { height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 4 }}>
        <Txt display size={14} style={{ flexShrink: 1 }}>
          {X.title + ' · ' + loc(TR.length)}
        </Txt>
        <Tap
          label={adding ? X.cancel : X.add}
          haptic
          onPress={() => {
            setAdding(!adding);
            setPend(null);
          }}
          style={{ height: 40, paddingStart: 10, paddingEnd: 14, borderRadius: R.pill, backgroundColor: adding ? c.soft : B.lime, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon d={adding ? I.close : I.plus} size={16} sw={2.2} color={adding ? c.ink : B.limeInk} />
          <Txt size={12.5} w={600} color={adding ? c.ink : B.limeInk}>
            {adding ? X.cancel : X.add}
          </Txt>
        </Tap>
      </View>

      <Card pad={12} gap={12}>
        {/* Map — positions are geographic, so they use physical left/top and do not mirror in RTL. */}
        <View onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 })} style={{ height: 230, borderRadius: 18, overflow: 'hidden' }}>
          <Photo src={PHOTO.basemap(800, 540, '&crop=focalpoint&fp-x=.4&fp-y=.5&fp-z=1.3')} label="Map of your trees" scrim={[[0, 0.2], [1, 0.2]]} style={StyleSheet.absoluteFill} />
          <Tap
            label={X.hint}
            disabled={!adding}
            onPress={onMap}
            accessibilityElementsHidden={!adding}
            importantForAccessibility={adding ? 'auto' : 'no-hide-descendants'}
            style={StyleSheet.absoluteFill}
          />
          {rows.map((r, i) => (
            <Tap
              key={r.tree.id}
              label={loc(i + 1) + '. ' + r.name + ', ' + r.s.label}
              selected={sel === i}
              hitSlop={7}
              onPress={() => setSel(sel === i ? -1 : i)}
              style={[
                {
                  position: 'absolute',
                  left: `${r.tree.x}%`,
                  top: `${r.tree.y}%`,
                  marginLeft: -15,
                  marginTop: -15,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  borderWidth: 2,
                  borderColor: B.navy,
                  backgroundColor: r.c,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                sel === i
                  ? { outlineColor: 'rgba(255,255,255,0.85)', outlineWidth: 4, outlineStyle: 'solid' }
                  : { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
              ]}>
              <Txt size={12} w={700} num color={r.fg} style={{ lineHeight: 15 }}>
                {loc(i + 1)}
              </Txt>
            </Tap>
          ))}
          {pend ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: `${pend.x}%`,
                top: `${pend.y}%`,
                marginLeft: -15,
                marginTop: -15,
                width: 30,
                height: 30,
                borderRadius: 15,
                borderWidth: 2.5,
                borderStyle: 'dashed',
                borderColor: B.white,
                backgroundColor: 'rgba(172,236,0,0.5)',
              }}
            />
          ) : null}
          {adding ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 10, start: 10, end: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(0,24,46,0.72)' }}>
              <Txt size={12} color={B.white} center style={{ lineHeight: 16 }}>
                {X.hint}
              </Txt>
            </View>
          ) : null}
        </View>

        {adding ? (
          <View style={{ gap: 12, padding: 12, borderRadius: 18, backgroundColor: c.bg }}>
            <View style={{ gap: 6 }}>
              <Txt label>{nm.nmL}</Txt>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={nm.nmPh}
                placeholderTextColor={c.ink2}
                accessibilityLabel={nm.nmL}
                returnKeyType="done"
                style={[field, { color: c.ink, paddingHorizontal: 12, fontFamily: font(500), fontSize: 14, textAlign: f.rtl ? 'right' : 'left' }]}
              />
              <Txt size={11} dim>
                {nm.regNote}
              </Txt>
            </View>

            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SPECIES_KEYS.map((k, i) => {
                const on = sp === i;
                return (
                  <Tap
                    key={k}
                    role="radio"
                    selected={on}
                    label={X.sp[k]}
                    haptic
                    onPress={() => setSp(i)}
                    style={{ height: 36, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: on ? B.lime : c.soft, justifyContent: 'center' }}>
                    <Txt size={12.5} w={600} color={on ? B.limeInk : c.ink}>
                      {X.sp[k]}
                    </Txt>
                  </Tap>
                );
              })}
            </View>

            <View style={{ gap: 6 }}>
              <Txt label>{X.date}</Txt>
              <View style={[field, { flexDirection: 'row', alignItems: 'center' }]}>
                <Tap label={nm.prev} haptic onPress={() => setDate(addDays(date, -1))} style={{ width: 44, height: 43, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={f.backPath} size={18} sw={2} />
                </Tap>
                <Txt size={14} w={500} num center style={{ flex: 1 }}>
                  {fmtD(date, loc, true)}
                </Txt>
                <Tap
                  label={nm.next}
                  haptic
                  disabled={date >= TODAY_ISO}
                  onPress={() => setDate(addDays(date, 1) > TODAY_ISO ? TODAY_ISO : addDays(date, 1))}
                  style={{ width: 44, height: 43, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={f.fwdPath} size={18} sw={2} />
                </Tap>
              </View>
            </View>

            <Tap
              label={pend ? X.save : X.pinFirst}
              haptic={!!pend}
              accessibilityState={{ disabled: !pend }}
              onPress={save}
              style={{ height: 48, borderRadius: R.pill, backgroundColor: pend ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={14} w={600} color={pend ? B.limeInk : c.ink2}>
                {pend ? X.save : X.pinFirst}
              </Txt>
            </Tap>
          </View>
        ) : null}

        <View>
          {rows.map((r, i) => (
            <Tap
              key={r.tree.id}
              label={r.name + ', ' + r.s.label}
              onPress={() => open(r.tree)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: c.line, borderRadius: 14, backgroundColor: sel === i ? c.limeSoft : 'transparent' }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: r.c, alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={12} w={700} num color={r.fg} style={{ lineHeight: 15 }}>
                  {loc(i + 1)}
                </Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={13.5} w={600}>
                  {r.name}
                </Txt>
                <Txt size={11.5} dim>
                  {r.meta}
                </Txt>
                <Tag label={r.s.label} bg={r.s.bg} fg={r.s.fg} size="xs" />
              </View>
              <Tap
                label={'Submit photo · ' + r.name}
                haptic
                hitSlop={6}
                onPress={() => open(r.tree)}
                style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: r.s.urgent ? B.navy : c.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={I.camera} size={18} sw={1.8} color={r.s.urgent ? B.lime : c.ink} />
              </Tap>
            </Tap>
          ))}
        </View>
        <Txt size={11.5} dim style={{ paddingHorizontal: 4 }}>
          {X.rule}
        </Txt>
      </Card>
    </View>
  );
}
