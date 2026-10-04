/** S18 · Organization page — photo hero, stats, goals across zones, contribution map, teams. */
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Avatar, Bar, Card, I, Icon, IconBtn, Label, LightStatusBar, ListRow, Photo, Screen, Txt } from '@/components/cz/ui';
import { AVATARS, B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { initials } from '@/lib/cz/format';
import { go, goBack } from '@/lib/cz/routes';

import { ORG_DOTS, ORG_GOALS, ORG_HERO, ORG_MAP, ORG_STATS, ORG_TEAM_LIST, T } from './data';

export default function OrgPage() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const insets = useSafeAreaInsets();

  return (
    <Screen bleed>
      <LightStatusBar />
      {/* Hero */}
      <Photo src={ORG_HERO} label="Aerial view of trees and rooftops" style={{ height: Math.max(320, 262 + insets.top) }} scrim={[[0, 0.5], [0.35, 0], [1, 0.88]]}>
        <IconBtn d={f.backPath} label="Back" tone="glass" onPress={goBack} style={{ position: 'absolute', top: insets.top + 12, start: 16 }} />
        <View pointerEvents="none" style={{ position: 'absolute', start: 20, end: 20, bottom: 20, gap: 8 }}>
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: B.blue }}>
            <Icon d={I.check} size={14} sw={2.6} color={B.white} />
            <Txt size={11.5} w={600} color={B.white}>
              {t.verifiedOrg}
            </Txt>
          </View>
          <Txt display size={24} color={B.white} accessibilityRole="header">
            DU Green Society
          </Txt>
          <Txt size={13} color="rgba(255,255,255,0.9)">
            {t.orgSub}
          </Txt>
        </View>
      </Photo>

      {/* Stats */}
      <View style={{ marginHorizontal: 16, flexDirection: 'row', gap: 6 }}>
        {ORG_STATS.map((val, i) => (
          <View key={i} style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 }}>
            <Txt size={18} w={600} num lines={1}>
              {f.loc(val)}
            </Txt>
            <Txt size={10.5} dim center lines={1}>
              {t.orgStats[i]}
            </Txt>
          </View>
        ))}
      </View>

      {/* Goals across zones */}
      <Card gap={14} style={{ marginHorizontal: 16 }}>
        <Label>{t.goalsZones}</Label>
        {ORG_GOALS.map(([zone, d, by, p]) => (
          <View key={zone} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Txt size={13.5} w={600} style={{ flexShrink: 1 }}>
                {zone}
              </Txt>
              <Txt size={12.5} dim lines={1}>
                {f.loc(`${f.dC(d)} · ${by}`)}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Bar pct={p} style={{ flex: 1 }} />
              <View style={{ width: 34, alignItems: 'flex-end' }}>
                <Txt size={12} w={600} num>
                  {f.loc(p)}%
                </Txt>
              </View>
            </View>
          </View>
        ))}
      </Card>

      {/* Contribution map */}
      <Card pad={12} gap={10} style={{ marginHorizontal: 16 }}>
        <Label style={{ paddingHorizontal: 4, paddingTop: 4 }}>{t.contribMap}</Label>
        <Photo src={ORG_MAP} label={t.contribMap} style={{ height: 180, borderRadius: 18 }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, direction: 'ltr' }}>
            <Svg width="100%" height="100%" viewBox="0 0 346 180" preserveAspectRatio="xMidYMid slice">
              {ORG_DOTS.map(([x, y, r]) => (
                <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={B.lime} fillOpacity={0.85} stroke={B.navy} strokeWidth={2} />
              ))}
            </Svg>
          </View>
        </Photo>
      </Card>

      {/* Teams */}
      <View style={{ marginHorizontal: 16, backgroundColor: c.card, borderRadius: R.xl, paddingVertical: 6, paddingHorizontal: 16 }}>
        {ORG_TEAM_LIST.map(([name, meta, p, opens], i) => (
          <ListRow key={name} last={i === ORG_TEAM_LIST.length - 1} label={opens ? name : undefined} onPress={opens ? () => go('S17') : undefined}>
            <Avatar ini={initials(name)} bg={AVATARS[i % 6][0]} fg={AVATARS[i % 6][1]} size={38} square />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={600}>
                {name}
              </Txt>
              <Txt size={11.5} dim>
                {f.loc(meta)}
              </Txt>
            </View>
            <Txt size={13} w={600} num>
              {f.num(p)}
            </Txt>
          </ListRow>
        ))}
      </View>
    </Screen>
  );
}
