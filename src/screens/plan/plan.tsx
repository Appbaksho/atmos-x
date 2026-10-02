/** S10 · Your plan (tab root) — ranked actions, planting map, species, tree catalog, nurseries. */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Card, CzButton, GhostButton, Icon, I, Photo, Screen, ScreenHeader, Seg, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import type { Fmt } from '@/lib/cz/format';
import { go, goPath, type ScreenId } from '@/lib/cz/routes';
import { CAT_T, PLAN_T, type CatCopy } from './copy';
import { goalLine, SPOTS, spotTaken, usePlan } from './plan-store';
import { PlantingMap } from './planting-map';
import { coolOf, DETAIL, midPrice, POLLEN, RECOMMENDED, treeName, TREES, type Cat } from './species-data';

/** Action icons from the prototype's plan screen. */
const AI = {
  roof: 'M3 11l9-7 9 7M5 10v10h14V10M9 20v-5h6v5',
  tree: 'M12 21v-5M12 3l6 9h-3l4 4H5l4-4H6z',
  vine: 'M8 21V3M8 7c3 0 5 1.5 5 4.5M8 13c3.5 0 6 1.5 6 4.5M13 11.5c1.6 0 3-.8 3-2.5-1.7 0-3 .8-3 2.5z',
  shade: 'M3 9l18-4-5 11zM10 13v8',
};
/** [icon, title, meta, cooling °C, cost ৳, effect in, cooling-per-৳ bar %, target screen] */
const ACTIONS: [keyof typeof AI, string, string, number, number, string | null, number, ScreenId][] = [
  ['roof', 'Cool-roof coating', 'Hostel roofs · 1,200 m²', -0.6, 14400, null, 100, 'S13'],
  ['tree', 'Street trees', 'Neem + Krishnachura · 24', -0.5, 12600, '3–5 yrs', 72, 'S11'],
  ['vine', 'Wall climbers', '3 sunny walls · 30 plants', -0.2, 3000, '6 months', 64, 'S13'],
  ['shade', 'Shade sails', 'Bus stop + market lane', -0.15, 9000, null, 30, 'S13'],
];

export default function PlanScreen() {
  const { c, f } = useCz();
  const t = f.pick(PLAN_T);
  const plan = usePlan();
  const F = f.unit === 'F';
  const range = f.dC(-1.3) + '…' + f.loc(Math.abs(F ? (-1.7 * 9) / 5 : -1.7).toFixed(1));
  const open = SPOTS.filter(([x, y]) => !spotTaken(plan.trees, x, y)).length;
  const summary = f.loc(plan.trees.length) + ' ' + t.placedW + ' · ' + f.loc(open) + ' ' + t.spotsW;

  return (
    <Screen tab>
      <ScreenHeader title={t.planTitle} sub={'Asad Gate block · ' + goalLine(f, plan)} back={false} big />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatCard label={t.modeled} value={range} color={c.leaf} />
        <StatCard label={t.budget + (f.rtl ? ' ←' : ' →')} value={'৳ ' + f.loc('48k')} onPress={() => go('S13')} />
        <StatCard label={t.firstEffect} value={t.wk1} />
      </View>

      <View style={{ gap: 10 }}>
        <Txt display size={14} style={{ paddingHorizontal: 4, paddingTop: 4 }}>
          {t.actions}
        </Txt>
        {ACTIONS.map(([ic, title, meta, cool, cost, time, w, to], i) => (
          <View key={ic} style={{ gap: 10 }}>
            <Tap label={`${i + 1}. ${title}, ${f.dC(cool)}`} onPress={() => go(to)} style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={AI[ic]} size={22} sw={1.7} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={14.5} w={600}>
                    {f.loc(i + 1) + '. ' + title}
                  </Txt>
                  <Txt size={12} dim>
                    {f.loc(meta)}
                  </Txt>
                </View>
                <Txt size={15} w={600} num color={c.leaf} lines={1}>
                  {f.dC(cool)}
                </Txt>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Chip text={f.tk(cost)} />
                <Chip text={t.effectIn + ' ' + (time ? f.loc(time) : t.wk1)} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt size={10.5} dim lines={1}>
                  {t.perTk}
                </Txt>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.soft, overflow: 'hidden' }}>
                  <View style={{ width: `${w}%`, height: '100%', borderRadius: 3, backgroundColor: B.lime }} />
                </View>
              </View>
            </Tap>

            {ic === 'tree' ? (
              <View style={{ backgroundColor: c.card, borderRadius: 22, padding: 12, gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 4, paddingTop: 2 }}>
                  <Txt size={13.5} w={600}>
                    {t.whereTitle}
                  </Txt>
                  <Txt size={11.5} dim style={{ flexShrink: 1 }}>
                    {summary}
                  </Txt>
                </View>
                <PlantingMap height={230} legend={{ spot: t.spot }} />
                <Txt size={12} dim style={{ paddingHorizontal: 4 }}>
                  {t.whereNote}
                </Txt>
                <Tap
                  label={t.editMap}
                  haptic
                  onPress={() => go('S09')}
                  style={{ height: 44, borderRadius: R.pill, backgroundColor: B.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon d={I.pin} size={16} color={B.lime} sw={2} />
                  <Txt size={13} w={600} color={B.white}>
                    {t.editMap}
                  </Txt>
                </Tap>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <Txt display size={14} style={{ paddingHorizontal: 4, paddingTop: 4 }}>
          {t.species}
        </Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4, gap: 10 }}>
          {RECOMMENDED.map((p) => {
            const name = DETAIL[p.key]?.name[f.lang] ?? p.name;
            return (
              <Tap key={p.key} label={name} role="link" onPress={() => goPath('/species/' + p.key)} style={{ width: 150, backgroundColor: c.card, borderRadius: 22, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 12, gap: 8 }}>
                <Photo src={p.src} label={name} style={{ width: '100%', height: 100, borderRadius: R.md, backgroundColor: B.photoBg2 }} />
                <View style={{ gap: 1, paddingHorizontal: 4 }}>
                  <Txt size={13.5} w={600} lines={1}>
                    {name}
                  </Txt>
                  <Txt size={11.5} dim lines={1} style={{ fontStyle: 'italic' }}>
                    {p.sci}
                  </Txt>
                  <Txt size={11} dim lines={1}>
                    {p.tag}
                  </Txt>
                </View>
              </Tap>
            );
          })}
        </ScrollView>
      </View>

      <TreeCatalog f={f} />

      <Tap label={t.nurseries} onPress={() => go('S12')} style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={I.pin} size={22} sw={1.7} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={14} w={600}>
            {t.nurseries}
          </Txt>
          <Txt size={12} dim>
            {f.loc(t.nurseLine)}
          </Txt>
        </View>
        <Icon d={f.fwdPath} size={16} sw={2} />
      </Tap>

      <View style={{ gap: 10 }}>
        <CzButton label={t.logFirst} icon="camera" onPress={() => go('S14')} />
        <GhostButton label={t.seeBudget} onPress={() => go('S13')} />
      </View>
    </Screen>
  );
}

/* ───────────────────────── Tree catalog ───────────────────────── */

const CAT_KEYS: ('all' | Cat)[] = ['all', 's', 'f', 'r', 'n'];

function TreeCatalog({ f }: { f: Fmt }) {
  const { c, prefs } = useCz();
  const C: CatCopy = f.pick(CAT_T);
  const lang = prefs.lang;
  const [tcat, setTcat] = useState(0);
  const [tsort, setTsort] = useState(0);
  const [tall, setTall] = useState(false);
  const [lowpPick, setLowp] = useState<boolean | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({ neem: 12, krish: 12 });
  const lowp = lowpPick ?? !prefs.farmer;
  const CB: Record<Cat, string> = { s: c.limeSoft, f: 'rgba(242,154,56,0.22)', r: 'rgba(76,175,80,0.2)', n: 'rgba(1,63,246,0.14)' };

  let L = TREES.slice();
  if (lowp) L = L.filter((r) => POLLEN[r[0]] !== 2);
  if (tcat) L = L.filter((r) => r[5] === CAT_KEYS[tcat]);
  const S = [(r: (typeof TREES)[number]) => -coolOf(r) / midPrice(r), (r: (typeof TREES)[number]) => midPrice(r), (r: (typeof TREES)[number]) => -r[6]][tsort];
  L.sort((a, b) => S(a) - S(b));
  const rows = tall ? L : L.slice(0, 6);

  let cnt = 0;
  let sap = 0;
  let cl = 0;
  TREES.forEach((r) => {
    const n = qty[r[0]] || 0;
    cnt += n;
    sap += n * midPrice(r);
    cl += n * coolOf(r);
  });
  const all = sap + cnt * 670;
  const sum: [string, string][] = [
    [C.sumTrees, f.loc(cnt)],
    [C.sumSap, f.tk(sap)],
    [C.sumAll, f.tk(all)],
    [C.sumCool, cl ? f.dC(-cl, 2) : '—'],
  ];
  const bump = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(99, (q[id] || 0) + d)) }));

  return (
    <Card pad={14}>
      <View style={{ gap: 3, paddingHorizontal: 2, paddingTop: 2 }}>
        <Txt display size={14}>
          {C.title}
        </Txt>
        <Txt size={12} dim>
          {C.sub}
        </Txt>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}>
        {C.cats.map((label, i) => {
          const on = tcat === i;
          return (
            <Tap key={label} role="tab" selected={on} label={label} haptic onPress={() => setTcat(i)} style={{ height: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: on ? B.navy : c.soft, justifyContent: 'center' }}>
              <Txt size={12.5} w={600} color={on ? B.white : c.ink}>
                {label}
              </Txt>
            </Tap>
          );
        })}
      </ScrollView>
      <Tap
        role="checkbox"
        selected={lowp}
        label={C.pollen[2]}
        haptic
        onPress={() => setLowp(!lowp)}
        style={{ alignSelf: 'flex-start', height: 36, paddingStart: 10, paddingEnd: 14, borderRadius: R.pill, borderWidth: 1.5, borderColor: lowp ? B.lime : c.line, backgroundColor: lowp ? c.limeSoft : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: lowp ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center' }}>
          {lowp ? <Icon d={I.check} size={12} color={B.limeInk} sw={3.2} /> : null}
        </View>
        <Txt size={12.5} w={600}>
          {C.pollen[2]}
        </Txt>
      </Tap>
      <Seg options={C.sorts.map((label, i) => ({ label, value: i }))} value={tsort} onChange={setTsort} height={36} />

      <View>
        {rows.map((r, k) => {
          const id = r[0];
          const n = qty[id] || 0;
          const best = r[6] >= 18 ? C.best.big : C.best[r[5]];
          const pollen = POLLEN[id] ? ' · ' + C.pollen[POLLEN[id] - 1] : '';
          return (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: CB[r[5]], alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={12.5} w={700}>
                  {f.loc(k + 1)}
                </Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={14} w={600} style={{ lineHeight: 19 }}>
                  {treeName(r, lang)}
                  {lang === 'en' ? (
                    <Txt size={14} dim>
                      {' ' + r[2]}
                    </Txt>
                  ) : null}
                </Txt>
                <Txt size={11.5} dim style={{ fontStyle: 'italic' }}>
                  {r[4]}
                </Txt>
                <Txt size={11.5} dim>
                  {C.canopyW + ' ' + f.loc(r[6]) + ' m · ' + f.dC(-coolOf(r), 3) + ' · ' + best + pollen}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt size={14} w={600} num lines={1}>
                    {'৳ ' + f.loc(r[7] === r[8] ? r[7] : r[7] + '–' + r[8])}
                  </Txt>
                  <Txt size={10.5} dim lines={1}>
                    {C.perTree + (r[9] ? '' : ' · ' + C.est)}
                  </Txt>
                </View>
                <MiniStepper value={f.loc(n)} active={n > 0} label={treeName(r, lang)} onDec={() => bump(id, -1)} onInc={() => bump(id, 1)} />
              </View>
            </View>
          );
        })}
      </View>
      {L.length > 6 ? <GhostButton label={tall ? C.showLess : C.showAll.replace('{n}', f.loc(L.length))} height={44} onPress={() => setTall(!tall)} /> : null}

      <View style={{ backgroundColor: B.navy, borderRadius: R.lg, padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {sum.map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={10.5} color="rgba(255,255,255,0.75)" lines={1}>
                {label}
              </Txt>
              <Txt size={14} w={600} num color={B.white} lines={1}>
                {val}
              </Txt>
            </View>
          ))}
        </View>
        <Txt size={12.5} color="rgba(255,255,255,0.9)">
          {C.perTreeAll + ': ' + (cnt ? f.tk(Math.round(all / cnt)) : '—')}
        </Txt>
        <Tap label={C.placeMap} haptic onPress={() => go('S09')} style={{ height: 42, borderRadius: R.pill, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={13} w={600} color={B.limeInk}>
            {C.placeMap}
          </Txt>
        </Tap>
      </View>
      <Txt size={11} dim>
        {C.allInNote}
      </Txt>
      <Txt size={11} dim>
        {C.srcNote}
      </Txt>
    </Card>
  );
}

/* ───────────────────────── Small parts ───────────────────────── */

function StatCard({ label, value, color, onPress }: { label: string; value: string; color?: string; onPress?: () => void }) {
  const { c } = useCz();
  const body = (
    <>
      <Txt size={11} dim lines={1}>
        {label}
      </Txt>
      <Txt size={15} w={600} num color={color} lines={1}>
        {value}
      </Txt>
    </>
  );
  const style = { flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: R.lg, padding: 12, gap: 4 };
  return onPress ? (
    <Tap label={`${label} ${value}`} onPress={onPress} style={style}>
      {body}
    </Tap>
  ) : (
    <View style={style}>{body}</View>
  );
}

function Chip({ text }: { text: string }) {
  const { c } = useCz();
  return (
    <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: c.soft }}>
      <Txt size={11.5} num>
        {text}
      </Txt>
    </View>
  );
}

/** Compact catalog stepper (36pt buttons, padded to a 44pt hit area); lime when the tree is in the plan. */
function MiniStepper({ value, active, label, onDec, onInc }: { value: string; active: boolean; label: string; onDec: () => void; onInc: () => void }) {
  const { c } = useCz();
  const btn = (txt: string, on: () => void, a11y: string) => (
    <Tap label={a11y} haptic hitSlop={6} onPress={on} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={18}>{txt}</Txt>
    </Tap>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderRadius: R.pill, backgroundColor: active ? B.lime : c.soft }}>
      {btn('−', onDec, `Fewer ${label}`)}
      <Txt size={14} w={700} num center color={active ? B.limeInk : c.ink} style={{ minWidth: 24 }}>
        {value}
      </Txt>
      {btn('+', onInc, `More ${label}`)}
    </View>
  );
}

