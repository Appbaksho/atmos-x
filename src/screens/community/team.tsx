/** S17 · Team dashboard — goal ring + modeled cooling with evidence, task board, members. */
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Card, Check, GhostButton, Label, ListRow, Ring, Screen, ScreenHeader, Seg, Tag, Txt } from '@/components/cz/ui';
import { AVATARS, B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { initials } from '@/lib/cz/format';
import { go } from '@/lib/cz/routes';

import { avatarOf, EVIDENCE, MEMBERS, T, TASK_COUNTS, TASKS, TEAM_PCT, TEAM_SIZE } from './data';

const WHITE_75 = 'rgba(255,255,255,0.75)';

export default function TeamDashboard() {
  const { c, f } = useCz();
  const t = f.pick(T);
  const [col, setCol] = useState(0);
  const done = col === 2;

  return (
    <Screen>
      <ScreenHeader
        title="Hall Rooftop Crew"
        sub={t.teamSub(f.loc(TEAM_SIZE))}
        right={<GhostButton label={t.invite} height={40} onPress={() => go('S19')} style={{ paddingHorizontal: 14 }} />}
      />

      {/* Hero: goal ring, modeled cooling, evidence */}
      <Card tone="navy" pad={18} gap={16} style={{ borderRadius: R.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Ring pct={TEAM_PCT} size={104} stroke={11} color={B.lime} track="rgba(255,255,255,0.14)">
            <Txt size={24} w={600} num color={B.white} style={{ lineHeight: 28 }}>
              {f.loc(TEAM_PCT)}%
            </Txt>
            <Txt size={10} color="rgba(255,255,255,0.8)">
              {t.ofGoal}
            </Txt>
          </Ring>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Label color={B.lime}>{t.headline}</Label>
            <Txt size={24} w={600} num color={B.white} style={{ lineHeight: 28 }}>
              {f.dC(-0.42, 2)}
            </Txt>
            <Txt size={12} color="rgba(255,255,255,0.8)">
              {t.goalOf(f.dC(-1.5))}
            </Txt>
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Label color="rgba(255,255,255,0.7)">{t.evidence}</Label>
          {EVIDENCE.map((e) => (
            <View
              key={e.src}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={13} w={600} color={B.white}>
                  {e.src}
                </Txt>
                <Txt size={11.5} color={WHITE_75}>
                  {f.loc(e.what(f.dC))}
                </Txt>
              </View>
              <Tag
                label={e.agrees ? t.agrees : t.noisy}
                bg={e.agrees ? B.lime : 'rgba(255,255,255,0.16)'}
                fg={e.agrees ? B.limeInk : B.white}
                style={{ alignSelf: 'center' }}
              />
            </View>
          ))}
        </View>
      </Card>

      {/* Task board */}
      <Card pad={14} gap={10}>
        <Seg value={col} onChange={setCol} options={t.cols.map((label, i) => ({ label: `${label} · ${f.loc(TASK_COUNTS[i])}`, value: i }))} />
        {TASKS[col].map(([title, due, who]) => {
          const av = avatarOf(who);
          return (
            <View
              key={title}
              accessible
              accessibilityLabel={`${title}, ${f.loc(due)}, ${who}`}
              accessibilityState={{ checked: done }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4 }}>
              <Check on={done} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Txt size={13.5} w={500}>
                  {title}
                </Txt>
                <Txt size={11.5} dim>
                  {f.loc(due)}
                </Txt>
              </View>
              <Avatar ini={who} bg={av[0]} fg={av[1]} size={30} />
            </View>
          );
        })}
      </Card>

      {/* Members */}
      <View style={{ backgroundColor: c.card, borderRadius: R.xl, paddingVertical: 6, paddingHorizontal: 16 }}>
        {MEMBERS.map(([name, role, p], i) => (
          <ListRow key={name} last={i === MEMBERS.length - 1}>
            <Avatar ini={initials(name)} bg={AVATARS[i % 6][0]} fg={AVATARS[i % 6][1]} size={38} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={13.5} w={600}>
                {name}
              </Txt>
              <Txt size={11.5} dim>
                {role}
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
