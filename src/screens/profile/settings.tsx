/** S22 · Settings — live language / units / theme / mode / Ask Atmos, privacy and notification toggles. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Card, I, Icon, ListRow, Screen, ScreenHeader, Seg, Tap, Txt, type SegOption } from '@/components/cz/ui';
import { B } from '@/constants/cz';
import { useCz, type Prefs } from '@/context/prefs';
import { go } from '@/lib/cz/routes';

const T = {
  en: {
    settings: 'Settings', liveNote: 'Changes apply to the whole app right away', lang: 'Language', units: 'Units', theme: 'Theme', mode: 'Mode', light: 'Light', dark: 'Dark',
    city: 'City', farmer: 'Farmer', farmerNote: 'Farmer mode swaps Home for field, crop stage and heat alerts.', privacy: 'Privacy', notifTypes: 'Notifications',
    askL: 'Ask Atmos', askShow: 'Show button', askHide: 'Hide', askNote: 'Floating AI chat on every screen', more: 'More', data: 'Data & science', account: 'Account',
  },
  bn: {
    settings: 'সেটিংস', lang: 'ভাষা', units: 'একক', theme: 'থিম', mode: 'মোড', light: 'হালকা', dark: 'গাঢ়', city: 'শহর', farmer: 'কৃষক', privacy: 'গোপনীয়তা', notifTypes: 'বিজ্ঞপ্তি',
    askShow: 'বাটন দেখান', askHide: 'লুকান', askNote: 'প্রতিটি পেজে ভাসমান AI চ্যাট', data: 'ডেটা ও বিজ্ঞান', account: 'অ্যাকাউন্ট',
  },
  ur: {
    settings: 'ترتیبات', lang: 'زبان', units: 'اکائیاں', theme: 'تھیم', mode: 'موڈ', light: 'روشن', dark: 'تاریک', city: 'شہر', farmer: 'کسان', privacy: 'رازداری', notifTypes: 'اطلاعات',
    askShow: 'بٹن دکھائیں', askHide: 'چھپائیں', askNote: 'ہر اسکرین پر AI چیٹ', data: 'ڈیٹا اور سائنس', account: 'اکاؤنٹ',
  },
};

type TgKey = 'lb' | 'snap' | 'research' | 'heat' | 'water' | 'surv' | 'verif' | 'inv' | 'quiet';
type TgRow = { k: TgKey; label: string; sub?: string; locked?: boolean };

/** One live segmented setting. */
function SegRow<V extends string | boolean>({ label, note, options, value, onChange, last }: { label: string; note?: string; options: SegOption<V>[]; value: V; onChange: (v: V) => void; last?: boolean }) {
  const { c } = useCz();
  return (
    <View style={{ gap: 8, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Txt size={13.5} w={600}>
        {label}
      </Txt>
      <Seg options={options} value={value} onChange={onChange} />
      {note ? (
        <Txt size={11.5} dim>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/** Toggle row: the whole row is the switch (≥44pt), the RN Switch is its visual. */
function ToggleRow({ row, on, onToggle, last }: { row: TgRow; on: boolean; onToggle: () => void; last?: boolean }) {
  const { c } = useCz();
  return (
    <Tap
      role="switch"
      label={row.label}
      accessibilityHint={row.sub}
      accessibilityState={{ checked: on, disabled: !!row.locked }}
      onPress={row.locked ? undefined : onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={13.5} w={500}>
          {row.label}
        </Txt>
        {row.sub ? (
          <Txt size={11.5} dim>
            {row.sub}
          </Txt>
        ) : null}
      </View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ opacity: row.locked ? 0.6 : 1 }}>
        <Switch value={on} trackColor={{ false: c.soft, true: B.lime }} thumbColor={B.white} ios_backgroundColor={c.soft} />
      </View>
    </Tap>
  );
}

export default function Settings() {
  const { c, f, prefs, setPref } = useCz();
  const t = f.pick(T);
  const [tg, setTg] = useState<Record<TgKey, boolean>>({ lb: true, snap: true, research: false, heat: true, water: true, surv: true, verif: true, inv: true, quiet: true });

  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPref(k, v);

  const groups: { name: string; rows: TgRow[] }[] = [
    {
      name: t.privacy,
      rows: [
        { k: 'lb', label: 'Show me on leaderboards', sub: 'Your name and points, never your location' },
        { k: 'snap', label: 'Snap contributions to zone centers', sub: 'Always on — exact spots are never shown', locked: true },
        { k: 'research', label: 'Share anonymized readings for research', sub: 'Helps NASA-based models improve' },
      ],
    },
    {
      name: t.notifTypes,
      rows: [
        { k: 'heat', label: 'Heat alerts', sub: 'Only Danger level and above' },
        { k: 'water', label: 'Watering reminders' },
        { k: 'surv', label: 'Survival photo checks' },
        { k: 'verif', label: 'Verification results' },
        { k: 'inv', label: 'Invites' },
        { k: 'quiet', label: 'Quiet hours', sub: f.loc('22:00–07:00 · heat alerts still come through') },
      ],
    },
  ];

  const links: { label: string; to: '/about' | '/auth'; icon: string }[] = [
    { label: t.data, to: '/about', icon: I.sat },
    { label: t.account, to: '/auth', icon: I.profile },
  ];

  return (
    <Screen>
      <ScreenHeader title={t.settings} sub={t.liveNote} />

      <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
        <SegRow
          label={t.lang}
          options={[
            { label: 'English', value: 'en' },
            { label: 'বাংলা', value: 'bn' },
            { label: 'اردو', value: 'ur' },
          ]}
          value={prefs.lang}
          onChange={set('lang')}
        />
        <SegRow
          label={t.units}
          options={[
            { label: '°C · km', value: 'C' },
            { label: '°F · mi', value: 'F' },
          ]}
          value={prefs.unit}
          onChange={set('unit')}
        />
        <SegRow
          label={t.theme}
          options={[
            { label: t.light, value: false },
            { label: t.dark, value: true },
          ]}
          value={!!prefs.dark}
          onChange={set('dark')}
        />
        <SegRow
          label={t.mode}
          note={t.farmerNote}
          options={[
            { label: t.city, value: false },
            { label: t.farmer, value: true },
          ]}
          value={!!prefs.farmer}
          onChange={(v) => {
            if (v === !!prefs.farmer) return;
            setPref('farmer', v);
            go('S04');
          }}
        />
        <SegRow
          last
          label={t.askL}
          note={t.askNote}
          options={[
            { label: t.askShow, value: true },
            { label: t.askHide, value: false },
          ]}
          value={prefs.askOn !== false}
          onChange={set('askOn')}
        />
      </Card>

      {groups.map((g) => (
        <View key={g.name} style={{ gap: 8 }}>
          <Txt label accessibilityRole="header" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
            {g.name}
          </Txt>
          <Card pad={0} gap={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
            {g.rows.map((r, i) => (
              <ToggleRow key={r.k} row={r} on={tg[r.k]} last={i === g.rows.length - 1} onToggle={() => setTg((s) => ({ ...s, [r.k]: !s[r.k] }))} />
            ))}
          </Card>
        </View>
      ))}

      <View style={{ gap: 8 }}>
        <Txt label accessibilityRole="header" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
          {t.more}
        </Txt>
        <Card pad={0} gap={0} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
          {links.map((l, i) => (
            <ListRow key={l.to} label={l.label} last={i === links.length - 1} onPress={() => router.push(l.to)}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={l.icon} size={18} sw={1.7} />
              </View>
              <Txt size={13.5} w={500} style={{ flex: 1, minWidth: 0 }}>
                {l.label}
              </Txt>
              <Icon d={f.fwdPath} size={16} sw={2} color={c.ink2} />
            </ListRow>
          ))}
        </Card>
      </View>

      <Txt size={11} dim center style={{ lineHeight: 18, paddingVertical: 4, paddingHorizontal: 12 }}>
        Atmos X 0.9 · Data: NASA Landsat, MODIS, POWER, GEOS-FP · OpenStreetMap contributors
      </Txt>
    </Screen>
  );
}
