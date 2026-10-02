/**
 * F03 · My fields — satellite map with field outlines, the field list, per-field weather, the
 * season outlook (stage calendar + climate risks) and tips. "Add field" switches the map into
 * outline mode (tap corners / walk the edge) and shows the new-field form with a live outlook.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Polyline } from 'react-native-svg';

import { Card, Check, CzButton, Field, GhostButton, I, Icon, Label, Photo, Screen, Tap, Txt } from '@/components/cz/ui';
import { B } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go } from '@/lib/cz/routes';
import {
  CROP_KEYS,
  CROPS,
  type CropKey,
  FD,
  FDT,
  farmCopy,
  farmHeat,
  fxCopy,
  inWin,
  parseDay,
  RISK_ICON,
  season,
  TI,
  type TipKind,
  type WhyArgs,
} from './farm-data';

const MAP_SRC = 'https://images.unsplash.com/photo-1558388556-2261d4cc1938?auto=format&fit=crop&w=800&h=720&q=70';

type Poly = { pts: string; lx: number; ly: number; alert?: boolean };
/** Field outlines in the prototype's 370×330 map canvas; label anchors in %. */
const POLYS: Poly[] = [
  { pts: '40,60 180,40 200,150 60,170', alert: true, lx: 33, ly: 33 },
  { pts: '210,50 330,70 320,180 225,160', lx: 74, ly: 36 },
  { pts: '80,200 210,185 220,290 95,300', lx: 41, ly: 75 },
];
const BASE: [CropKey, string, number][] = [
  ['aman', '2026-07-15', 1.2],
  ['aman', '2026-07-29', 1.6],
  ['tomato', '2026-08-20', 0.6],
];
/** Where newly added fields are drawn. */
const SLOTS: Poly[] = [
  { pts: '240,210 330,200 345,300', lx: 82, ly: 72 },
  { pts: '18,190 72,184 76,250 22,256', lx: 13, ly: 67 },
];
/** Demo outline being drawn in add mode. */
const DP: [number, number][] = [
  [240, 210],
  [330, 200],
  [345, 300],
];

type Form = { name: string; acres: number; crop: CropKey; sow: string };
const FORM0: Form = { name: '', acres: 0.8, crop: 'potato', sow: '2026-11-10' };
type Added = { name: string; crop: CropKey; sow: string; acres: number };

const pad2 = (n: number) => String(n).padStart(2, '0');
function shiftDay(iso: string, days: number): string {
  const d = parseDay(iso);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function MyFields() {
  const { c, f, prefs } = useCz();
  const lang = prefs.lang;
  const t = farmCopy(lang);
  const fx = fxCopy(lang);
  const [sel, setSel] = useState(0);
  const [add, setAdd] = useState(-1);
  const [added, setAdded] = useState<Added[]>([]);
  const [form, setForm] = useState<Form>(FORM0);
  const [unk, setUnk] = useState(false);

  const MON = t.mon;
  const fmt = (d: Date) => f.loc(d.getDate()) + ' ' + MON[d.getMonth()];
  const cropName = (k: string) => t.cropN[k] || k;
  const adding = add >= 0;

  const AF = BASE.map(([crop, sow, acres], i) => ({ name: t.fieldNames[i], crop, sow, acres, poly: POLYS[i], alert: !!POLYS[i].alert, base: i })).concat(
    added.map((a, j) => ({ ...a, poly: SLOTS[j % 2], alert: false, base: -1 })),
  );
  const si = Math.min(sel, AF.length - 1);
  const outs = AF.map((fl, i) => season(fl.crop, fl.sow, i === 0));

  const fields = AF.map((fl, i) => {
    const o = outs[i];
    const isB = fl.base >= 0;
    const curName = o ? (o.cur ? t.stN[o.cur.k] : o.planned ? t.planned : t.stN[o.stages[o.stages.length - 1].k]) : '';
    return {
      ...fl,
      meta: isB ? t.metaL[i] : `${f.loc(fl.acres.toFixed(1))} ${t.acresW} · ${cropName(fl.crop)}`,
      stage: isB ? t.chips[i] : curName,
    };
  });

  // Season outlook for the selected field, or for the form while adding.
  const O = adding ? season(form.crop, form.sow, false) : outs[si];
  const oCrop = adding ? form.crop : AF[si].crop;
  const oSow = adding ? form.sow : AF[si].sow;
  const why = (w: WhyArgs): string => {
    switch (w[0]) {
      case 'heat':
        return t.whyHeat.replace('{a}', f.deg(w[1])).replace('{b}', f.deg(w[2]));
      case 'cold':
        return t.whyCold.replace('{a}', f.deg(w[1]));
      case 'blight':
        return t.whyBlight;
      case 'flood':
        return t.whyFlood.replace('{a}', f.loc(w[1])).replace('{m}', MON[w[2]]);
      case 'dry':
        return t.whyDry.replace('{a}', f.loc(w[1])).replace('{m}', MON[w[2]]);
      case 'storm':
        return t.whyStorm;
      case 'rain':
        return t.whyRain.replace('{a}', f.loc(w[1]));
      case 'live':
        return t.whyLive.replace('{a}', f.deg(36));
    }
  };
  const out = O
    ? {
        title: `${cropName(oCrop)} · ${O.planned ? t.sowingL : t.sownL} ${fmt(parseDay(oSow))}`,
        harvest: '≈ ' + fmt(O.end),
        dur: `${f.loc(O.total)} ${t.daysW}`,
        stages: O.stages,
        prog: O.prog,
        risks: O.risks
          .slice()
          .sort((a, b) => b.level - a.level || a.a.getTime() - b.a.getTime())
          .map((r) => ({
            lv: r.level,
            level: r.level === 2 ? t.hi : t.med,
            start: fmt(r.a),
            when: `${t.stN[r.stage]} · ${fmt(r.a)} – ${fmt(r.b)}`,
            title: t.rt[r.type].replace('{s}', t.stN[r.stage]),
            why: why(r.why),
            action: t.ra[r.type],
            icon: RISK_ICON[r.type],
          })),
      }
    : null;

  // Selected field: weather + tips.
  const fd = FD[si < 3 ? si : 0];
  const tr = si < 3 ? FDT[lang]?.[si] : undefined;
  const soil = tr ? tr[1] : (FDT[lang]?.[0]?.[1] ?? fd.wx[5]);
  const stageLine = si >= 3 ? (out ? out.title : '') : tr ? tr[0] : fd.stage;
  type Tip = { kind: TipKind; tag: string; title: string; why: string; icon: string; cta: string; to?: 'F02' | 'S14' };
  const tips: Tip[] =
    si >= 3
      ? (() => {
          const L: Tip[] = (out ? out.risks : []).slice(0, 3).map((r) => ({ kind: r.lv === 2 ? 'u' : 'w', tag: `${r.level} · ${r.start}`, title: r.title, why: r.action, icon: r.icon, cta: '' }));
          if (!L.length) L.push({ kind: 'p', tag: t.log, title: t.edgeTitle, why: t.edgeSub, icon: TI.tree, cta: t.log, to: 'S14' });
          return L;
        })()
      : fd.tips.map(([tag, kind, ic, title, w, cta, to], j) => {
          const x = tr?.[2][j];
          return {
            kind,
            tag: x ? x[0] : tag,
            title: x ? x[1] : title,
            why: x ? x[2] : w,
            icon: TI[ic],
            cta: (cta && (x ? x[3] : cta)) || '',
            to,
          };
        });

  const W0 = CROPS[form.crop].win;
  const inW = inWin(form.sow, W0);
  const wRange = `${f.loc(W0[1])} ${MON[W0[0]]} – ${f.loc(W0[3])} ${MON[W0[2]]}`;
  const totA = AF.reduce((a, x) => a + x.acres, 0).toFixed(1);
  const nF = AF.length;
  const fieldsSub = f.loc({ en: `${nF} fields · ${totA} acres`, bn: `${nF}টি জমি · ${totA} একর`, ur: `${nF} کھیت · ${totA} ایکڑ` }[lang]);

  const saveField = () => {
    const n = added.length;
    setAdded([...added, { name: form.name.trim() || `${t.newField} ${f.loc(n + 1)}`, crop: form.crop, sow: form.sow, acres: form.acres }]);
    setSel(3 + n);
    setAdd(-1);
    setForm(FORM0);
  };

  const TAG: Record<TipKind, { tagBg: string; tagFg: string; ibg: string; ifg: string; ring?: string }> = {
    u: { tagBg: B.deepRed, tagFg: B.white, ibg: 'rgba(229,83,61,0.14)', ifg: B.red, ring: B.red },
    w: { tagBg: c.soft, tagFg: c.ink, ibg: c.soft, ifg: c.ink },
    p: { tagBg: B.blue, tagFg: B.white, ibg: c.limeSoft, ifg: c.ink },
  };

  return (
    <Screen tab>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
        <View style={{ flexShrink: 1, minWidth: 0, gap: 4 }}>
          <Txt display size={21} accessibilityRole="header">
            {t.myFields}
          </Txt>
          <Txt size={12} dim num>
            {fieldsSub}
          </Txt>
        </View>
        <Tap
          label={t.addBtn}
          haptic
          onPress={() => setAdd(0)}
          style={{ height: 44, paddingStart: 12, paddingEnd: 16, borderRadius: 999, backgroundColor: B.lime, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 3, height: 3 }, elevation: 2 }}>
          <Icon d={I.plus} size={18} color={B.limeInk} sw={2.2} />
          <Txt size={13} w={600} color={B.limeInk}>
            {t.addBtn}
          </Txt>
        </Tap>
      </View>

      {/* Satellite map with field outlines */}
      <Photo src={MAP_SRC} style={{ height: 330, borderRadius: 24 }} label="Satellite view of your fields">
        <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 370 330" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          {AF.map((fl, i) => {
            const on = si === i && !adding;
            return (
              <Polygon
                key={i}
                points={fl.poly.pts}
                fill={on ? B.lime : B.white}
                fillOpacity={0.28}
                stroke={on ? B.lime : 'rgba(255,255,255,0.85)'}
                strokeWidth={on ? 3 : 2}
                strokeLinejoin="round"
              />
            );
          })}
          {adding ? (
            <>
              <Polyline points={DP.map((p) => p.join(',')).join(' ')} fill="none" stroke={B.white} strokeWidth={2.5} strokeDasharray="6 5" strokeLinejoin="round" />
              {DP.map(([x, y]) => (
                <Circle key={x} cx={x} cy={y} r={6} fill={B.white} stroke={B.navy} strokeWidth={2} />
              ))}
            </>
          ) : null}
        </Svg>
        {/* Field labels are anchored to the map, so they use absolute left/top. */}
        {fields.map((fl, i) => (
          <View key={i} style={{ position: 'absolute', left: `${fl.poly.lx}%`, top: `${fl.poly.ly}%`, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Tap
              label={fl.name}
              selected={si === i}
              hitSlop={8}
              onPress={() => {
                setSel(i);
                setAdd(-1);
              }}
              style={{ height: 30, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(0,24,46,0.6)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fl.alert ? B.red : B.lime }} />
              <Txt size={11.5} w={600} color={B.white} lines={1}>
                {fl.name}
              </Txt>
            </Tap>
          </View>
        ))}
        {adding ? (
          <View pointerEvents="none" style={{ position: 'absolute', start: 12, end: 12, bottom: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(0,24,46,0.7)' }}>
            <Txt size={12.5} color={B.white}>
              {add === 1 ? t.walkHint : t.tapHint}
            </Txt>
          </View>
        ) : null}
      </Photo>

      {/* Outline modes */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[t.tap, t.walk].map((label, i) => {
          const on = add === i;
          return (
            <Tap
              key={label}
              role="radio"
              selected={on}
              label={label}
              haptic
              onPress={() => setAdd(on ? -1 : i)}
              style={{ flex: 1, height: 56, borderRadius: 18, backgroundColor: on ? B.lime : c.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon d={i ? TI.walkMode : TI.tapMode} size={18} color={on ? B.limeInk : c.ink} />
              <Txt size={13} w={600} color={on ? B.limeInk : c.ink} lines={1}>
                {label}
              </Txt>
            </Tap>
          );
        })}
      </View>

      {adding ? (
        <Card gap={16}>
          <Txt display size={15}>
            {t.addTitle}
          </Txt>
          <Field label={t.fName} value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder={t.newField} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Label>{t.area}</Label>
              <Txt size={15} w={600} num>
                {`${f.loc(form.acres.toFixed(1))} ${t.acresW}`}
              </Txt>
              <Txt size={11.5} dim>
                {t.fromMap}
              </Txt>
            </View>
            <PlusMinus
              label={t.area}
              onDec={() => setForm({ ...form, acres: Math.max(0.1, +(form.acres - 0.1).toFixed(1)) })}
              onInc={() => setForm({ ...form, acres: Math.min(20, +(form.acres + 0.1).toFixed(1)) })}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t.cropL}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {CROP_KEYS.map((k) => {
                const on = form.crop === k;
                return (
                  <Tap
                    key={k}
                    role="radio"
                    selected={on}
                    label={cropName(k)}
                    haptic
                    onPress={() => setForm({ ...form, crop: k, sow: CROPS[k].def })}
                    style={{ height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? B.lime : c.soft, justifyContent: 'center' }}>
                    <Txt size={13} w={600} color={on ? B.limeInk : c.ink}>
                      {cropName(k)}
                    </Txt>
                  </Tap>
                );
              })}
            </View>
          </View>
          <Tap
            role="checkbox"
            selected={unk}
            label={fx.unk}
            onPress={() => setUnk(!unk)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: unk ? c.limeSoft : c.soft }}>
            <Check on={unk} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt size={13.5} w={600}>
                {fx.unk}
              </Txt>
              <Txt size={11.5} dim>
                {unk ? fx.unkSub : fx.unkOff}
              </Txt>
            </View>
          </Tap>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t.sowL}
                value={form.sow}
                onChangeText={(sow) => setForm({ ...form, sow })}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                autoCorrect={false}
              />
            </View>
            <PlusMinus label={t.sowL} onDec={() => setForm({ ...form, sow: shiftDay(form.sow, -7) })} onInc={() => setForm({ ...form, sow: shiftDay(form.sow, 7) })} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: inW ? c.limeSoft : 'rgba(242,154,56,0.2)' }}>
            <Icon d={TI.calendar} size={16} sw={2} />
            <Txt size={12.5} style={{ flex: 1 }}>
              {inW ? `${t.window}: ${wRange}` : `${t.outWin} ${t.window}: ${wRange}`}
            </Txt>
          </View>
        </Card>
      ) : (
        <>
          {/* Field list */}
          <Card pad={16} gap={0} style={{ paddingVertical: 6 }}>
            {fields.map((fl, i) => {
              const on = si === i;
              const line = i < fields.length - 1 && si !== i && si !== i + 1;
              return (
                <Tap
                  key={i}
                  role="radio"
                  selected={on}
                  label={`${fl.name}, ${fl.meta}, ${fl.stage}`}
                  onPress={() => {
                    setSel(i);
                    setAdd(-1);
                  }}
                  style={{
                    marginHorizontal: -8,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    borderRadius: 16,
                    backgroundColor: on ? c.limeSoft : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: line ? c.line : 'transparent',
                  }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon d={TI.plant} size={20} sw={1.7} />
                    {fl.alert ? (
                      <View style={{ position: 'absolute', top: -2, end: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: B.red, borderWidth: 2, borderColor: c.card }} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={14} w={600} lines={1}>
                      {fl.name}
                    </Txt>
                    <Txt size={12} dim num lines={1}>
                      {fl.meta}
                    </Txt>
                  </View>
                  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: i === 0 ? B.lime : c.soft }}>
                    <Txt size={11} w={600} color={i === 0 ? B.limeInk : c.ink} lines={1}>
                      {fl.stage}
                    </Txt>
                  </View>
                </Tap>
              );
            })}
          </Card>

          {/* Field weather */}
          <View style={{ backgroundColor: B.navy, borderRadius: 28, padding: 18, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flexShrink: 1, minWidth: 0, gap: 4 }}>
                <Label color={B.lime}>{t.weather}</Label>
                <Txt size={16} w={600} color={B.white}>
                  {AF[si].name}
                </Txt>
                <Txt size={11.5} color="rgba(255,255,255,0.75)">
                  {t.wxSrc}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Txt size={46} num color={B.white} style={{ lineHeight: 50, letterSpacing: -1.3 }}>
                  {f.deg(fd.wx[0])}
                </Txt>
                <Txt size={12} color="rgba(255,255,255,0.85)" lines={1}>
                  {`${t.feelsL} ${f.deg(fd.wx[1])}`}
                </Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(
                [
                  [t.hum, f.loc(fd.wx[2]) + '%'],
                  [t.windL, f.loc(fd.wx[3]) + ' km/h'],
                  [t.rain48, `${f.loc(fd.wx[4])} ${t.mm}`],
                  [t.soil, soil],
                ] as [string, string][]
              ).map(([label, val]) => (
                <View
                  key={label}
                  style={{ flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', gap: 3 }}>
                  <Txt size={10.5} color="rgba(255,255,255,0.75)" lines={1} center>
                    {label}
                  </Txt>
                  <Txt size={13} w={600} color={B.white} num lines={1} center>
                    {val}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {fd.days.map(([mx, mm], i) => (
                <View
                  key={i}
                  accessible
                  accessibilityLabel={`${t.days[i]}: ${f.deg(mx)}`}
                  style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 2, borderRadius: 14, backgroundColor: mx >= 35 ? 'rgba(229,83,61,0.22)' : 'rgba(255,255,255,0.06)' }}>
                  <Txt size={11} color="rgba(255,255,255,0.85)" lines={1}>
                    {t.days[i]}
                  </Txt>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: farmHeat(mx) }} />
                  <Txt size={15} w={600} num color={B.white}>
                    {f.deg(mx)}
                  </Txt>
                  <Txt size={10} num color="rgba(255,255,255,0.7)" lines={1}>
                    {mm ? `${f.loc(mm)} ${t.mm}` : '—'}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* Season outlook */}
      {out ? (
        <Card gap={14}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flexShrink: 1, minWidth: 0, gap: 3 }}>
              <Label>{t.outlook}</Label>
              <Txt size={15} w={600} num>
                {out.title}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Txt size={11} dim>
                {t.harvestL}
              </Txt>
              <Txt size={15} w={600} num lines={1}>
                {out.harvest}
              </Txt>
              <Txt size={11} dim num>
                {out.dur}
              </Txt>
            </View>
          </View>
          <View style={{ paddingTop: 20 }}>
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
              {out.stages.map((g) => (
                <View key={g.k} style={{ flex: g.n, height: '100%', backgroundColor: g.done ? c.leaf : g.now ? B.lime : c.soft }} />
              ))}
            </View>
            {out.prog > 0 && out.prog < 1 ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, start: `${+(out.prog * 100).toFixed(1)}%`, width: 0, alignItems: 'center' }}>
                <View style={{ alignItems: 'center', gap: 2, width: 60 }}>
                  <Txt size={10} w={700}>
                    {t.nowL}
                  </Txt>
                  <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: c.ink }} />
                </View>
              </View>
            ) : null}
          </View>
          <View>
            {out.stages.map((g) => (
              <View key={g.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.line }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: g.now ? 'rgba(172,236,0,0.35)' : 'transparent' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.done ? c.leaf : g.now ? B.lime : c.soft }} />
                </View>
                <Txt size={13} w={g.now ? 700 : 500} style={{ flex: 1, minWidth: 0 }}>
                  {t.stN[g.k]}
                </Txt>
                <Txt size={12} dim num lines={1}>
                  {`${fmt(g.a)} – ${fmt(g.b)}`}
                </Txt>
                <View
                  accessible
                  accessibilityLabel={g.risk === 2 ? t.hi : g.risk === 1 ? t.med : g.done ? 'done' : ''}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: g.risk === 2 ? B.deepRed : g.risk === 1 ? B.orange : g.done ? c.soft : 'transparent',
                  }}>
                  {g.risk ? (
                    <Txt size={11} w={700} color={g.risk === 2 ? B.white : B.navy}>
                      !
                    </Txt>
                  ) : g.done ? (
                    <Icon d={I.check} size={12} color={c.ink2} sw={2.6} />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          <Label>{`${t.risksAhead} · ${f.loc(out.risks.length)}`}</Label>
          {!out.risks.length ? (
            <View style={{ padding: 12, borderRadius: 16, backgroundColor: c.limeSoft }}>
              <Txt size={12.5}>{t.noRisk}</Txt>
            </View>
          ) : null}
          {out.risks.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 18, backgroundColor: c.bg }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: r.lv === 2 ? 'rgba(229,83,61,0.14)' : 'rgba(242,154,56,0.18)' }}>
                <Icon d={r.icon} size={19} color={r.lv === 2 ? B.red : B.orangeInk} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: r.lv === 2 ? B.deepRed : B.orange }}>
                    <Txt label color={r.lv === 2 ? B.white : B.navy} style={{ fontSize: 10.5 }}>
                      {r.level}
                    </Txt>
                  </View>
                  <Txt size={11.5} dim num>
                    {r.when}
                  </Txt>
                </View>
                <Txt size={13.5} w={600}>
                  {r.title}
                </Txt>
                <Txt size={12} dim num>
                  {r.why}
                </Txt>
                <Txt size={12.5}>
                  <Txt size={12.5} w={700} color={c.leaf}>
                    {f.rtl ? '←' : '→'}
                  </Txt>{' '}
                  {r.action}
                </Txt>
              </View>
            </View>
          ))}
          <Txt size={11} dim>
            {t.outSrc}
          </Txt>
        </Card>
      ) : null}

      {adding ? (
        <View style={{ gap: 10 }}>
          <CzButton label={t.save} icon="check" onPress={saveField} />
          <GhostButton label={t.cancel} onPress={() => setAdd(-1)} />
        </View>
      ) : (
        <>
          {/* Tips for the selected field */}
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 4, paddingTop: 4 }}>
              <Txt display size={14}>
                {t.suggest}
              </Txt>
              <Txt size={11.5} dim style={{ flexShrink: 1 }}>
                {stageLine}
              </Txt>
            </View>
            {tips.map((s, i) => {
              const g = TAG[s.kind];
              return (
                <View
                  key={i}
                  style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: g.ring ? 2 : 0, borderColor: g.ring }}>
                  <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: g.ibg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon d={s.icon} size={20} color={g.ifg} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                    <View style={{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: g.tagBg }}>
                      <Txt label color={g.tagFg} style={{ fontSize: 10.5 }}>
                        {s.tag}
                      </Txt>
                    </View>
                    <Txt size={14} w={600}>
                      {s.title}
                    </Txt>
                    <Txt size={12.5} dim>
                      {s.why}
                    </Txt>
                    {s.cta ? (
                      <Tap
                        label={s.cta}
                        haptic
                        onPress={() => s.to && go(s.to)}
                        style={{ alignSelf: 'flex-start', marginTop: 4, height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: B.lime, justifyContent: 'center' }}>
                        <Txt size={12.5} w={600} color={B.limeInk}>
                          {s.cta}
                        </Txt>
                      </Tap>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Beekeeper idea */}
          <View style={{ backgroundColor: c.card, borderRadius: 24, padding: 14, gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Txt size={14} w={600} style={{ flexShrink: 1 }}>
                {fx.beeTitle}
              </Txt>
              <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.soft }}>
                <Txt label color={c.ink} style={{ fontSize: 10.5 }}>
                  {fx.idea}
                </Txt>
              </View>
            </View>
            <Txt size={12.5} dim>
              {fx.beeSub}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {fx.bee.map((b) => (
                <View key={b} style={{ height: 30, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.soft }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: B.yellow }} />
                  <Txt size={12}>{b}</Txt>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

/** − / + pair (value shown separately, as in the prototype). */
function PlusMinus({ label, onDec, onInc }: { label: string; onDec: () => void; onInc: () => void }) {
  const { c } = useCz();
  const btn = (s: string, on: () => void, a11y: string) => (
    <Tap label={a11y} haptic onPress={on} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={20}>{s}</Txt>
    </Tap>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: 999, backgroundColor: c.soft }}>
      {btn('−', onDec, `Decrease ${label}`)}
      {btn('+', onInc, `Increase ${label}`)}
    </View>
  );
}
