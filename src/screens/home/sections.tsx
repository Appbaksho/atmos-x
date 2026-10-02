/** S04 · Home sections below the hero: air teaser, trees due a photo, hottest zones, goal + next task. */
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, CzButton, Divider, GhostButton, I, Icon, Label, Photo, Ring, SectionTitle, Tap, Txt } from '@/components/cz/ui';
import { AQI_COLORS, AQI_FG, B, heatColor, heatFg, pmBand, R, SHADOW } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { GOAL, PHOTO, PM_NOW, photoDueIn, SPECIES_NAMES, ZONES } from '@/lib/cz/demo';
import { go, goPath } from '@/lib/cz/routes';
import { AIR_T, DUE_T, HOME_T } from './i18n';

/* ───────────────────────── Air quality teaser ───────────────────────── */

export function AirCard() {
  const { c, f } = useCz();
  const t = f.pick(AIR_T);
  const band = pmBand(PM_NOW);
  const bg = AQI_COLORS[band];
  const fg = AQI_FG[band];
  return (
    <Card onPress={() => go('S26')} label={`${t.title}: PM2.5 ${PM_NOW}, ${t.cat}`} pad={14} style={[styles.mx, styles.rowCard]}>
      <View style={[styles.pmTile, { backgroundColor: bg }]}>
        <Txt size={22} w={600} color={fg} num style={{ lineHeight: 24 }}>
          {f.loc(PM_NOW)}
        </Txt>
        <Txt size={9.5} w={600} color={fg} style={{ lineHeight: 12 }}>
          PM2.5
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={styles.wrapRow}>
          <Txt size={13.5} w={600}>
            {t.title}
          </Txt>
          <View style={[styles.tag, { backgroundColor: bg }]}>
            <Txt size={10.5} w={700} color={fg}>
              {t.cat}
            </Txt>
          </View>
        </View>
        <Txt size={12} dim style={{ lineHeight: 17 }}>
          {t.tip}
        </Txt>
        <Txt size={10.5} dim>
          {t.src}
        </Txt>
      </View>
      <Icon d={f.fwdPath} size={16} color={c.ink} sw={2} />
    </Card>
  );
}

/* ───────────────────────── Trees that need a photo ───────────────────────── */

export function DueTreesCard() {
  const { c, f, prefs } = useCz();
  const t = f.pick(DUE_T);
  const sp = SPECIES_NAMES[prefs.lang] ?? SPECIES_NAMES.en;
  const due = prefs.trees
    .map((tree) => ({ tree, days: photoDueIn(tree) }))
    .filter((o) => o.days <= 0)
    .sort((a, b) => a.days - b.days);
  if (!due.length) return null;

  return (
    <View style={[styles.mx, styles.due, { backgroundColor: c.card }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={styles.dueIcon}>
          <Icon d={I.camera} size={20} color={B.orangeInk} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt size={15} w={600} accessibilityRole="header">
            {t.title.replace('{n}', f.loc(due.length))}
          </Txt>
          {due.slice(0, 3).map(({ tree, days }) => {
            const over = days < 0;
            const col = over ? B.deepRed : B.orange;
            const name = sp[tree.sp] ?? tree.sp;
            const line = (tree.name ? `${tree.name} (${name})` : name) + ' · ' + (over ? t.od.replace('{n}', f.loc(-days)) : t.today);
            return (
              <Tap key={tree.id} label={line} onPress={() => goPath('/tree/' + tree.id)} style={styles.dueRow}>
                <View style={[styles.ini, { backgroundColor: col }]}>
                  <Txt size={12} w={700} color={over ? B.white : B.navy}>
                    {(tree.name || '?').slice(0, 1)}
                  </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Txt size={13} w={600}>
                    {line}
                  </Txt>
                  <View style={[styles.track, { backgroundColor: c.soft }]}>
                    <View style={{ height: '100%', borderRadius: 3, backgroundColor: col, width: `${Math.min(100, 40 + -days * 15)}%` }} />
                  </View>
                </View>
                <Icon d={f.fwdPath} size={16} sw={2} />
              </Tap>
            );
          })}
          <Txt size={11.5} dim>
            {t.rule}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <CzButton label={t.submit} icon="camera" size="md" onPress={() => goPath('/tree/' + due[0].tree.id)} style={{ flex: 1 }} />
        <GhostButton label={t.mine} height={46} onPress={() => go('S20')} />
      </View>
    </View>
  );
}

/* ───────────────────────── Hottest zones carousel ───────────────────────── */

export function HottestZones() {
  const { c, f } = useCz();
  const t = f.pick(HOME_T);
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title={t.hottest} action={t.seeMap} onAction={() => go('S05')} style={{ paddingHorizontal: 20 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4, gap: 10 }}>
        {ZONES.map((z) => {
          const meta = `LST ${f.deg(z.lst)} · ${f.loc(z.distM)} m`;
          return (
            <Tap key={z.id} label={`${z.name}, ${t.score} ${z.score}, ${meta}`} onPress={() => goPath('/zone/' + z.id)} style={[styles.zone, { backgroundColor: c.card }]}>
              <Photo src={z.img} style={styles.zonePhoto}>
                <View style={[styles.zoneBadge, { backgroundColor: heatColor(z.score) }]}>
                  <Txt size={11.5} w={700} color={heatFg(z.score)} num>
                    {f.loc(z.score)}
                  </Txt>
                </View>
              </Photo>
              <View style={styles.zoneFoot}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={13} w={600} lines={1}>
                    {z.name}
                  </Txt>
                  <Txt size={11.5} dim num lines={1}>
                    {meta}
                  </Txt>
                </View>
                <View style={styles.zoneGo}>
                  <Icon d={f.arrowPath} size={16} color={B.limeInk} sw={2} />
                </View>
              </View>
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── Goal + next task ───────────────────────── */

export function GoalCard() {
  const { f, prefs } = useCz();
  const t = f.pick(HOME_T);
  const area = prefs.area === 'imperial' ? f.num(120 * 10.7639) + ' ft²' : f.loc(120) + ' m²';
  const goalLine = t.goalLine.replace('{d}', f.dC(GOAL.targetC));
  return (
    <Card style={styles.mx} gap={14}>
      <Tap label={`${t.goal}: ${goalLine}`} onPress={() => go('S17')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ring pct={GOAL.pct} size={72} stroke={9}>
          <Txt size={16} w={600} num>
            {f.loc(GOAL.pct)}%
          </Txt>
        </Ring>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Label>{t.goal}</Label>
          <Txt size={16} w={600}>
            {goalLine}
          </Txt>
          <Txt size={12} dim>
            {t.goalSub.replace('{d}', f.dC(GOAL.modeledC, 2))}
          </Txt>
        </View>
      </Tap>
      <Divider />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Photo src={PHOTO.neighborhood(200, 200)} style={[styles.taskPhoto, { backgroundColor: B.photoBg2 }]} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Label>{t.next}</Label>
          <Txt size={14} w={600}>
            {t.task.replace('{a}', area)}
          </Txt>
          <Txt size={12} dim>
            {t.due}
          </Txt>
        </View>
        <CzButton label={t.logAction} icon="camera" size="sm" onPress={() => go('S14')} />
      </View>
    </Card>
  );
}


const styles = StyleSheet.create({
  mx: { marginHorizontal: 16 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  wrapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pmTile: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.pill },
  due: { borderRadius: R.xl, padding: 14, gap: 12, borderWidth: 2, borderColor: B.orange },
  dueIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(242,154,56,0.2)', alignItems: 'center', justifyContent: 'center' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 14, minHeight: 48 },
  ini: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  zone: { width: 172, borderRadius: R.xl, paddingTop: 8, paddingHorizontal: 8, paddingBottom: 12, gap: 10 },
  zonePhoto: { height: 110, borderRadius: 18 },
  zoneBadge: { position: 'absolute', top: 8, start: 8, height: 26, paddingHorizontal: 9, borderRadius: R.pill, justifyContent: 'center' },
  zoneFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  zoneGo: { width: 36, height: 36, borderRadius: 18, backgroundColor: B.lime, alignItems: 'center', justifyContent: 'center', ...SHADOW.button },
  taskPhoto: { width: 56, height: 56, borderRadius: 16 },
});
