/** S16 · Community hub (tab root) — my clans, leaderboards (people/teams/orgs × area/city/country), rising board. */
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar, Card, I, Icon, IconBtn, Label, Screen, ScreenHeader, SectionTitle, Seg, Tap, Txt } from '@/components/cz/ui';
import { AVATARS, B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { initials } from '@/lib/cz/format';
import { go } from '@/lib/cz/routes';

import { BOARDS, ORG_TEAMS, RISING, SCOPE_MUL, T, TEAM_PCT, TEAM_SIZE } from './data';

/** The prototype's verified seal (blue rosette + white tick). */
function VerifiedSeal({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2l2.6 2.2 3.4-.4.9 3.3 3 1.7-1.3 3.2 1.3 3.2-3 1.7-.9 3.3-3.4-.4L12 22l-2.6-2.2-3.4.4-.9-3.3-3-1.7L3.4 12 2.1 8.8l3-1.7.9-3.3 3.4.4z" fill={B.blue} />
      <Path d="M8 12.2l2.6 2.6L16 9.4" fill="none" stroke={B.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function CommunityHub() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const [who, setWho] = useState(1);
  const [scope, setScope] = useState(0);

  const board = BOARDS[who];
  const mul = SCOPE_MUL[scope];
  const youSuffix = [t.you, t.yourTeam, t.yourOrg][who];
  const rows = [
    ...board.top.map(([name, p], i) => ({ name, rank: i + 1, pts: p * mul, av: AVATARS[(i + 1) % 6], me: false })),
    { name: `${board.me[0]} ${youSuffix}`, rank: board.rank[scope], pts: board.me[1], av: AVATARS[0], me: true },
  ];

  return (
    <Screen tab gap={16}>
      <ScreenHeader
        title={t.hub}
        sub={t.hubSub}
        back={false}
        big
        right={<IconBtn d={I.plus} label={t.newTeamA11y} tone="lime" iconSize={20} onPress={() => go('S19')} />}
      />

      {/* My clans */}
      <View style={{ gap: 10 }}>
        <Label style={{ paddingHorizontal: 4 }}>{t.myClans}</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tap
            label={`Hall Rooftop Crew, ${f.loc(TEAM_PCT)}%`}
            onPress={() => go('S17')}
            style={{ flex: 1, minWidth: 0, backgroundColor: B.navy, borderRadius: R.xl, padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Avatar ini="HR" bg={B.lime} fg={B.limeInk} size={40} square />
              <Txt size={22} w={600} num color={B.lime}>
                {f.loc(TEAM_PCT)}%
              </Txt>
            </View>
            <View style={{ gap: 2 }}>
              <Txt size={14} w={600} color={B.white} lines={1}>
                Hall Rooftop Crew
              </Txt>
              <Txt size={11.5} color="rgba(255,255,255,0.75)" lines={1}>
                {t.teamMeta(f.loc(TEAM_SIZE))}
              </Txt>
            </View>
          </Tap>
          <Tap
            label={`DU Green Society, ${t.verifiedOrg}`}
            onPress={() => go('S18')}
            style={{ flex: 1, minWidth: 0, backgroundColor: c.card, borderRadius: R.xl, padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Avatar ini="DU" bg={B.blue} fg={B.white} size={40} square />
              <VerifiedSeal />
            </View>
            <View style={{ gap: 2 }}>
              <Txt size={14} w={600} lines={1}>
                DU Green Society
              </Txt>
              <Txt size={11.5} dim lines={1}>
                {t.orgMeta(f.loc(ORG_TEAMS))}
              </Txt>
            </View>
          </Tap>
        </View>
      </View>

      {/* Leaderboards */}
      <View style={{ gap: 10 }}>
        <SectionTitle title={t.boards} style={{ paddingTop: 4 }} />
        <Seg tone="card" height={40} value={who} onChange={setWho} options={t.who.map((label, i) => ({ label, value: i }))} />
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6 }}>
          {t.scopes.map((label, i) => {
            const on = scope === i;
            return (
              <Tap
                key={label}
                role="tab"
                selected={on}
                label={label}
                haptic
                hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                onPress={() => setScope(i)}
                style={{ height: 34, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1.5, borderColor: on ? c.ink : c.line, justifyContent: 'center' }}>
                <Txt size={12} w={600} color={on ? c.ink : c.ink2}>
                  {label}
                </Txt>
              </Tap>
            );
          })}
        </View>
        <View style={{ backgroundColor: c.card, borderRadius: R.xl, paddingVertical: 4, paddingHorizontal: 14 }}>
          {rows.map((r, i) => (
            <View
              key={r.name}
              accessible
              accessibilityLabel={`${f.loc(r.rank)}. ${r.name}, ${f.num(r.pts)} ${t.points}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                paddingHorizontal: 8,
                marginHorizontal: -8,
                borderRadius: 14,
                backgroundColor: r.me ? c.limeSoft : 'transparent',
                borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                borderBottomColor: c.line,
              }}>
              <Txt size={13} w={600} dim num style={{ width: 24 }} lines={1}>
                {f.loc(r.rank)}
              </Txt>
              <Avatar ini={initials(r.name)} bg={r.av[0]} fg={r.av[1]} size={36} />
              <Txt size={14} w={r.me ? 600 : 500} lines={1} style={{ flex: 1, minWidth: 0 }}>
                {r.name}
              </Txt>
              <Txt size={13} w={600} num>
                {f.num(r.pts)}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      {/* Rising board */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Label>{t.rising}</Label>
          <Txt size={11.5} dim>
            {t.thisWeek}
          </Txt>
        </View>
        {RISING.map(([name, up, why]) => (
          <View key={name} accessible accessibilityLabel={`${name}, ${t.up(f.loc(up))}, ${f.loc(why)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ height: 28, minWidth: 52, paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: c.limeSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <Icon d={I.up} size={12} sw={3} />
              <Txt size={12} w={700} num>
                {f.loc(up)}
              </Txt>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={600}>
                {name}
              </Txt>
              <Txt size={11.5} dim>
                {f.loc(why)}
              </Txt>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
