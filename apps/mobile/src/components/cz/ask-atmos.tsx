/**
 * Ask Atmos (S29) — floating AI chat available on every screen. Knows which screen it was opened
 * from, answers only from Atmos X data with source chips, puts official warnings first, and any
 * action it suggests needs a tap. Answers are canned from the prototype until an LLM endpoint
 * (e.g. a Supabase edge function) is wired in `answer()`.
 */
import { usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { B, SHADOW } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go, type ScreenId } from '@/lib/cz/routes';
import { I } from './icons';
import { Icon, Tap, Txt } from './ui';

type Kind = 'heat' | 'air' | 'farm' | 'tree';
type Msg = { role: 'user' | 'bot'; text: string; photo?: boolean; kind?: Kind; src?: string[]; warn?: boolean; rated?: boolean };

const ASK = {
  en: {
    sub: 'Answers from Atmos X data, with sources',
    hello: 'Ask about heat, weather, air, your trees or crops. I only use Atmos X data and say so when I don’t have it.',
    ph: 'Type a question…',
    busy: 'Checking Atmos X data…',
    official: 'Official:',
    warnTxt: 'BMD heat-wave warning for Dhaka until Sunday 4 Oct.',
    photoTag: 'Photo attached',
    helpful: 'Helpful',
    thanks: 'Thanks ✓',
    limit: '{n} of 30 messages today · no medical or pesticide-dose advice',
    sugg: {
      heat: ['Why is my zone so hot?', 'Is it safe to jog at 6 pm?'],
      air: ['Should I open the windows now?', 'Which mask works for PM2.5?'],
      farm: ['Should I irrigate before Sunday?', 'When will my rice be ready?'],
      tree: ['Why are Agun’s leaves curling?', 'Which tree should I plant next?'],
    },
    act: { heat: 'Create goal', air: 'Open air quality', farm: 'See alert', tree: 'Open my trees' },
    canned: {
      heat: 'Your zone is hot mainly because 78% of the surface is sealed and only 6% is green. Air is 34°, feels like 41°, and roofs and roads hit 52°. Sunday peaks at 36° — stay in shade 11:00–15:00 and drink water often.',
      air: 'Outdoor PM2.5 is 62 μg/m³ — about 4× the WHO line — while indoors is 38. Keep windows shut now and open them after 10 pm, when the forecast drops near 40. Wear a well-fitted N95 outside.',
      farm: 'Yes. Your Aman rice is flowering (satellite-detected 28 Sep) and Sunday reaches 36°. Raise standing water to 5 cm this evening and top up Sunday at dawn.',
      tree: 'Agun’s last photo showed slight curl on the top shoots — that matches heat stress, not disease. Give 10 L of water Saturday evening and add a 30 cm mulch ring. Its photo is 3 days overdue — submit one so points resume.',
    },
  },
  bn: {
    sub: 'Atmos X-এর তথ্য থেকে উত্তর, উৎসসহ',
    hello: 'তাপ, আবহাওয়া, বাতাস, আপনার গাছ বা ফসল নিয়ে জিজ্ঞাসা করুন। আমি শুধু Atmos X-এর তথ্য ব্যবহার করি, না থাকলে জানিয়ে দিই।',
    ph: 'প্রশ্ন লিখুন…',
    busy: 'Atmos X-এর তথ্য দেখছি…',
    official: 'সরকারি:',
    warnTxt: 'রবিবার ৪ অক্টোবর পর্যন্ত ঢাকায় আবহাওয়া অধিদপ্তরের তাপপ্রবাহ সতর্কতা।',
    photoTag: 'ছবি যুক্ত',
    helpful: 'কাজে লেগেছে',
    thanks: 'ধন্যবাদ ✓',
    limit: 'আজ ৩০টির মধ্যে {n}টি বার্তা · চিকিৎসা বা কীটনাশকের মাত্রার পরামর্শ নয়',
    sugg: {
      heat: ['আমার এলাকা এত গরম কেন?', 'সন্ধ্যা ৬টায় দৌড়ানো কি নিরাপদ?'],
      air: ['এখন কি জানালা খুলব?', 'PM2.5-এর জন্য কোন মাস্ক?'],
      farm: ['রবিবারের আগে কি সেচ দেব?', 'ধান কবে কাটা যাবে?'],
      tree: ['আগুনের পাতা কোঁকড়াচ্ছে কেন?', 'এরপর কোন গাছ লাগাব?'],
    },
    act: { heat: 'লক্ষ্য তৈরি', air: 'বাতাসের মান দেখুন', farm: 'সতর্কতা দেখুন', tree: 'আমার গাছ' },
    canned: {
      heat: 'আপনার এলাকা গরম মূলত কারণ ৭৮% জায়গা পাকা আর সবুজ মাত্র ৬%। বাতাস ৩৪°, অনুভূত ৪১°, ছাদ ও রাস্তা ৫২°। রবিবার ৩৬° হবে — ১১টা–৩টা ছায়ায় থাকুন, বারবার পানি খান।',
      air: 'বাইরে PM2.5 ৬২ μg/m³ — WHO সীমার প্রায় ৪ গুণ, ভেতরে ৩৮। এখন জানালা বন্ধ রাখুন, রাত ১০টার পর খুলুন। বাইরে ভালোভাবে ফিট N95 পরুন।',
      farm: 'হ্যাঁ। আপনার আমন ধানে ফুল এসেছে (স্যাটেলাইটে শনাক্ত ২৮ সেপ্টে) আর রবিবার ৩৬° হবে। আজ সন্ধ্যায় জমিতে ৫ সেমি পানি রাখুন, রবিবার ভোরে আবার দিন।',
      tree: 'আগুনের শেষ ছবিতে ওপরের ডগায় সামান্য পাতা কোঁকড়ানো ছিল — এটা তাপের চাপ, রোগ নয়। শনিবার সন্ধ্যায় ১০ লিটার পানি আর গোড়ায় ৩০ সেমি মালচ দিন। ছবি ৩ দিন দেরি — জমা দিলে পয়েন্ট আবার চালু হবে।',
    },
  },
};

const SRC: Record<Kind, string[]> = {
  heat: ['Landsat 9 · 27 Sep', 'Weather API · 14:00', 'GEOS-FP · 2 Oct'],
  air: ['OpenAQ community · 14:00', 'NASA GEOS-CF · 00 UTC', 'Indoor sensor · 14:01'],
  farm: ['GEOS-FP · 2 Oct 06:00 UTC', 'Sentinel-2 · 28 Sep'],
  tree: ['My trees · ATX-26-0004', 'GEOS-FP · 2 Oct'],
};
const TO: Record<Kind, ScreenId> = { heat: 'S08', air: 'S26', farm: 'F02', tree: 'S20' };
const LIMIT = 30;

/** Which screen the user is on → context chip + default topic. */
function screenContext(path: string, farmer: boolean): { name: string; kind: Kind; place: string } {
  const p = path === '/' ? '/home' : path;
  const table: [string, string, Kind][] = [
    ['/home', farmer ? 'Farmer home' : 'Home', farmer ? 'farm' : 'heat'],
    ['/map', farmer ? 'My fields' : 'Heat map', farmer ? 'farm' : 'heat'],
    ['/plan', 'Plan', 'tree'],
    ['/community', 'Community hub', 'heat'],
    ['/profile', 'Profile', 'tree'],
    ['/zone/projection', 'Projection', 'heat'],
    ['/zone', 'Zone detail', 'heat'],
    ['/goal/feasibility', 'Feasibility', 'tree'],
    ['/goal', 'Goal wizard', 'tree'],
    ['/species', 'Species detail', 'tree'],
    ['/nurseries', 'Nursery map', 'tree'],
    ['/budget', 'Budget', 'tree'],
    ['/log-action', 'Log action', 'tree'],
    ['/contribution', 'Contribution detail', 'tree'],
    ['/team/new', 'Create & invite', 'heat'],
    ['/team', 'Team dashboard', 'heat'],
    ['/org', 'Organization page', 'heat'],
    ['/notifications', 'Notifications', 'tree'],
    ['/settings', 'Settings', 'tree'],
    ['/tree', 'My tree', 'tree'],
    ['/air/devices', 'My devices', 'air'],
    ['/air/add', 'Add sensor', 'air'],
    ['/air', 'Air quality', 'air'],
    ['/farm', 'Alert detail', 'farm'],
    ['/onboarding', 'Welcome', 'heat'],
  ];
  const hit = table.find(([prefix]) => p.startsWith(prefix));
  const [, name, kind] = hit ?? ['', 'Home', 'heat' as Kind];
  return { name, kind, place: kind === 'farm' ? 'North plot' : 'Asad Gate block' };
}

function kindOf(q: string, fallback: Kind): Kind {
  if (/pm|air|smog|dust|window|mask|বাতাস|ধুলা|জানালা|মাস্ক/i.test(q)) return 'air';
  if (/rice|crop|field|irrigat|harvest|ধান|জমি|ফসল|সেচ|কাটা/i.test(q)) return 'farm';
  if (/tree|leaf|leaves|neem|plant|agun|beguni|shanti|গাছ|পাতা|আগুন|বেগুনি|লাগা/i.test(q)) return 'tree';
  return fallback;
}

type AskState = { open: () => void; close: () => void; isOpen: boolean };
const Ctx = createContext<AskState | null>(null);
export function useAsk() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAsk must be used inside AskProvider');
  return v;
}

const TAB_PATHS = new Set(['/', '/map', '/plan', '/community', '/profile']);
const HIDDEN_PATHS = ['/log-action', '/onboarding/welcome'];

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }), [isOpen]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <AskAtmos />
    </Ctx.Provider>
  );
}

function AskAtmos() {
  const { isOpen, open, close } = useAsk();
  const { prefs, c, f, font } = useCz();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const A = prefs.lang === 'bn' ? ASK.bn : ASK.en;
  const ctx = screenContext(path, prefs.farmer);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const sent = msgs.filter((m) => m.role === 'user').length;

  const send = useCallback(
    (text?: string) => {
      const query = (text ?? q).trim();
      if (!query || busy || sent >= LIMIT) return;
      const kind = kindOf(query, ctx.kind);
      setMsgs((m) => [...m, { role: 'user', text: query, photo }]);
      setQ('');
      setPhoto(false);
      setBusy(true);
      setTimeout(() => {
        setBusy(false);
        setMsgs((m) => [...m, { role: 'bot', text: A.canned[kind], kind, src: SRC[kind], warn: kind === 'heat' || kind === 'farm' }]);
        setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
      }, 900);
    },
    [q, busy, sent, ctx.kind, photo, A],
  );

  if (!prefs.askOn || HIDDEN_PATHS.some((p) => path.startsWith(p))) return null;
  const onTab = TAB_PATHS.has(path);
  const fab = onTab ? 56 : 48;

  return (
    <>
      {!isOpen ? (
        <Tap
          label="Ask Atmos"
          haptic
          onPress={open}
          style={[
            {
              position: 'absolute',
              end: 16,
              bottom: (onTab ? 100 : 22) + insets.bottom,
              width: fab,
              height: fab,
              borderRadius: fab / 2,
              borderWidth: 3,
              borderColor: B.lime,
              backgroundColor: B.navy,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 70,
            },
            SHADOW.fab,
          ]}>
          <Icon d={I.sparkle} size={24} color={B.lime} sw={2} />
        </Tap>
      ) : null}

      <Modal visible={isOpen} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,16,32,0.45)', direction: f.rtl ? 'rtl' : 'ltr' }}>
          <Pressable style={{ flex: 1, minHeight: 90 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close Ask Atmos" />
          <View style={[{ height: '76%', backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 }, SHADOW.sheet]}>
            <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={I.sparkleOne} size={18} color={B.lime} sw={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt display size={15} accessibilityRole="header">
                    Ask Atmos
                  </Txt>
                  <Txt size={11.5} dim>
                    {A.sub}
                  </Txt>
                </View>
                <Tap label="Close" onPress={close} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={I.close} size={16} sw={2.2} />
                </Tap>
              </View>
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: c.limeSoft }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: B.blue }} />
                <Txt size={11.5} w={600}>
                  {ctx.name} · {ctx.place}
                </Txt>
              </View>
            </View>

            <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
              {!msgs.length ? (
                <>
                  <Txt size={13} dim>
                    {A.hello}
                  </Txt>
                  <View style={{ gap: 8 }}>
                    {A.sugg[ctx.kind].map((s) => (
                      <Tap key={s} label={s} onPress={() => send(s)} style={{ alignSelf: 'flex-start', borderWidth: 1.5, borderColor: c.line, backgroundColor: c.card, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' }}>
                        <Txt size={13} w={500}>
                          {s}
                        </Txt>
                      </Tap>
                    ))}
                  </View>
                </>
              ) : null}
              {msgs.map((m, i) =>
                m.role === 'user' ? (
                  <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '82%', alignItems: 'flex-end', gap: 4 }}>
                    {m.photo ? (
                      <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: c.soft }}>
                        <Txt size={11}>{A.photoTag}</Txt>
                      </View>
                    ) : null}
                    <View style={{ backgroundColor: B.lime, borderRadius: 18, borderBottomEndRadius: 4, paddingVertical: 10, paddingHorizontal: 14 }}>
                      <Txt size={13.5} color={B.limeInk}>
                        {m.text}
                      </Txt>
                    </View>
                  </View>
                ) : (
                  <View key={i} style={{ alignSelf: 'flex-start', maxWidth: '90%', gap: 6 }} accessibilityLiveRegion="polite">
                    {m.warn ? (
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: B.deepRed }}>
                        <Icon d={I.warn} size={16} color={B.white} sw={2.2} />
                        <Txt size={12} color={B.white} style={{ flex: 1 }}>
                          <Txt size={12} w={700} color={B.white}>
                            {A.official}
                          </Txt>{' '}
                          {A.warnTxt}
                        </Txt>
                      </View>
                    ) : null}
                    <View style={{ backgroundColor: c.card, borderRadius: 18, borderBottomStartRadius: 4, padding: 12, paddingHorizontal: 14 }}>
                      <Txt size={13.5}>{m.text}</Txt>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {(m.src ?? []).map((s) => (
                        <View key={s} style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.soft }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: B.blue }} />
                          <Txt size={10.5} w={600}>
                            {s}
                          </Txt>
                        </View>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      {m.kind ? (
                        <Tap
                          label={A.act[m.kind]}
                          haptic
                          onPress={() => {
                            close();
                            go(TO[m.kind!]);
                          }}
                          style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: B.navy, justifyContent: 'center' }}>
                          <Txt size={12.5} w={600} color={B.white}>
                            {A.act[m.kind]}
                          </Txt>
                        </Tap>
                      ) : null}
                      <Tap
                        label={m.rated ? A.thanks : A.helpful}
                        onPress={() => setMsgs((all) => all.map((x, j) => (j === i ? { ...x, rated: true } : x)))}
                        style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, backgroundColor: m.rated ? c.limeSoft : 'transparent', justifyContent: 'center' }}>
                        <Txt size={12} w={600}>
                          {m.rated ? A.thanks : A.helpful}
                        </Txt>
                      </Tap>
                    </View>
                  </View>
                ),
              )}
              {busy ? (
                <View style={{ alignSelf: 'flex-start', backgroundColor: c.card, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 }}>
                  <Txt size={12.5} dim>
                    {A.busy}
                  </Txt>
                </View>
              ) : null}
            </ScrollView>

            <View style={{ paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 + insets.bottom, gap: 6, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tap
                  role="checkbox"
                  selected={photo}
                  label="Attach photo"
                  onPress={() => setPhoto((p) => !p)}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: photo ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={I.camera} size={19} color={photo ? B.limeInk : c.ink} />
                </Tap>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  onSubmitEditing={() => send()}
                  returnKeyType="send"
                  placeholder={A.ph}
                  placeholderTextColor={c.ink2}
                  accessibilityLabel={A.ph}
                  style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 999, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.bg, color: c.ink, paddingHorizontal: 16, fontFamily: font(500), fontSize: 14, textAlign: f.rtl ? 'right' : 'left' }}
                />
                <Tap label="Send" haptic onPress={() => send()} disabled={!q.trim() || busy} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={f.arrowPath} size={18} color={B.limeInk} sw={2} />
                </Tap>
              </View>
              <Txt size={10.5} dim center>
                {A.limit.replace('{n}', f.loc(sent))}
              </Txt>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
