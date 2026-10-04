/** S21 · Notifications — filters, Today/Earlier groups, unread state and per-item actions. */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FilterChip, Icon, I, Screen, ScreenHeader, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go } from '@/lib/cz/routes';

const T = {
  en: { notifs: 'Notifications', readAll: 'Mark all read', nf: ['All', 'Reminders', 'Results', 'Invites', 'Alerts'], today: 'Today', earlier: 'Earlier', unread: '{n} unread', caught: 'All caught up' },
  bn: { notifs: 'বিজ্ঞপ্তি', readAll: 'সব পড়া হয়েছে', nf: ['সব', 'রিমাইন্ডার', 'ফলাফল', 'আমন্ত্রণ', 'সতর্কতা'], today: 'আজ', earlier: 'আগে' },
  ur: { notifs: 'اطلاعات', readAll: 'سب پڑھ لیا', nf: ['سب', 'یاد دہانی', 'نتائج', 'دعوتیں', 'انتباہ'], today: 'آج', earlier: 'پہلے' },
};

type Btn = { label: string; on: () => void; primary?: boolean };
type Note = { k: string; g: 0 | 1; cat: number; icon: string; bg: string; fg: string; title: string; body: string; time: string; btns: Btn[] };

/** Small pill action inside a notification (lime primary / outline secondary). */
function ActBtn({ b }: { b: Btn }) {
  const { c } = useCz();
  return (
    <Tap
      label={b.label}
      haptic
      onPress={b.on}
      style={{
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: R.pill,
        borderWidth: b.primary ? 0 : 1.5,
        borderColor: c.line,
        backgroundColor: b.primary ? B.lime : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Txt size={12.5} w={600} color={b.primary ? B.limeInk : c.ink} lines={1}>
        {b.label}
      </Txt>
    </Tap>
  );
}

export default function Notifications() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const loc = f.loc;
  const [nf, setNf] = useState(0);
  const [read, setRead] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const mark = (k: string) => () => setDone((d) => ({ ...d, [k]: true }));

  const N: Note[] = [
    {
      k: 'heat', g: 0, cat: 4, icon: I.sun, bg: B.red, fg: B.white,
      title: 'Danger heat today, 13:00–16:00', body: 'Feels like ' + f.deg(41) + ' in Mohammadpur. Shade and water by 12:30.', time: '11:05',
      btns: [{ label: 'Open Home', on: () => go('S04'), primary: true }],
    },
    {
      k: 'water', g: 0, cat: 1, icon: I.drop, bg: B.blue, fg: B.white,
      title: 'Water the 3 Neem at Asad Gate', body: 'Week 1 of 52 · twice a week keeps survival above 90%.', time: '09:00',
      btns: done.water ? [] : [{ label: 'Done', on: mark('water'), primary: true }, { label: 'Snooze 3 h', on: mark('water') }],
    },
    {
      k: 'verif', g: 0, cat: 2, icon: I.check, bg: B.lime, fg: B.limeInk,
      title: '+120 pts — 3 Neem verified', body: 'AI 94% sure, GPS inside zone. Your team moved up to #9.', time: '08:41',
      btns: [{ label: 'See details', on: () => go('S15') }],
    },
    {
      k: 'inv', g: 0, cat: 3, icon: I.community, bg: B.navy, fg: B.lime,
      title: 'Tania invited you to Ring Road Shade Squad', body: 'Goal −1.0 °C by Jun 2027 · 7 members.', time: '07:30',
      btns: done.inv ? [] : [{ label: 'Accept', on: mark('inv'), primary: true }, { label: 'Decline', on: mark('inv') }],
    },
    {
      k: 'surv', g: 1, cat: 1, icon: I.camera, bg: c.soft, fg: c.ink,
      title: 'Day-30 survival photo due 1 Nov', body: 'Same spot, same angle. Unlocks +40 pts per tree.', time: 'Yesterday',
      btns: [{ label: 'Open camera', on: () => go('S14') }],
    },
    {
      k: 'sat', g: 1, cat: 2, icon: I.sat, bg: c.soft, fg: c.ink,
      title: 'New satellite pass processed', body: 'Landsat 9 · 27 Sep. Heat Scores refreshed for 24 zones.', time: '28 Sep',
      btns: [],
    },
  ];

  const isUnread = (n: Note) => !read && n.g === 0 && !done[n.k];
  const vis = N.filter((n) => nf === 0 || n.cat === nf);
  const groups = [t.today, t.earlier].map((name, gi) => ({ name, items: vis.filter((n) => n.g === gi) })).filter((g) => g.items.length);
  const unreadN = read ? 0 : N.filter((n) => n.g === 0 && !done[n.k]).length;

  return (
    <Screen>
      <ScreenHeader
        title={t.notifs}
        sub={unreadN ? t.unread.replace('{n}', loc(unreadN)) : t.caught}
        right={
          <Tap
            role="button"
            label={t.readAll}
            disabled={unreadN === 0}
            onPress={() => setRead(true)}
            style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: R.pill, justifyContent: 'center' }}>
            <Txt size={13} w={600} color={c.leaf}>
              {t.readAll}
            </Txt>
          </Tap>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
        {t.nf.map((label, i) => (
          <FilterChip key={label} label={label} active={nf === i} onPress={() => setNf(i)} />
        ))}
      </ScrollView>

      {groups.map((g) => (
        <View key={g.name} style={{ gap: 8 }}>
          <Txt label accessibilityRole="header" style={{ paddingHorizontal: 4, paddingTop: 4 }}>
            {g.name}
          </Txt>
          {g.items.map((n) => {
            const unread = isUnread(n);
            return (
              <View key={n.k} style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={n.icon} size={19} sw={1.8} color={n.fg} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View accessible accessibilityLabel={(unread ? 'Unread. ' : '') + n.title + '. ' + n.body + '. ' + loc(n.time)} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Txt size={14} w={unread ? 700 : 600} style={{ flex: 1, minWidth: 0 }}>
                        {n.title}
                      </Txt>
                      <Txt size={11} dim num style={{ paddingTop: 2 }}>
                        {loc(n.time)}
                      </Txt>
                    </View>
                    <Txt size={12.5} dim style={{ lineHeight: 18 }}>
                      {n.body}
                    </Txt>
                  </View>
                  {n.btns.length ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
                      {n.btns.map((b) => (
                        <ActBtn key={b.label} b={b} />
                      ))}
                    </View>
                  ) : null}
                </View>
                {unread ? <View style={{ position: 'absolute', top: 14, start: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: B.blue }} /> : null}
              </View>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}
