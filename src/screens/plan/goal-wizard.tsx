/** S08 · Cooling goal wizard — zone, existing goals, space inventory, target + timeline. */
import { View } from 'react-native';

import { Card, CzButton, Divider, GhostButton, HeatBadge, Label, Photo, Screen, ScreenHeader, Seg, Tap, Txt } from '@/components/cz/ui';
import { B, R } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { go } from '@/lib/cz/routes';
import { PLAN_T } from './copy';
import { GD, setPlan, T4, TL, usePlan } from './plan-store';

const ZONE_THUMB =
  'https://images.unsplash.com/photo-1592396131156-0d1a9c1f6869?auto=format&fit=crop&crop=focalpoint&fp-x=.3&fp-y=.55&fp-z=2.2&w=240&h=240&q=70';

export default function GoalWizard() {
  const { c, f } = useCz();
  const t = f.pick(PLAN_T);
  const plan = usePlan();
  const goalDate = f.loc(GD[plan.tl]);
  const actionGoal = TL[plan.tl] < 0.5;

  const inv: [string, string][] = [
    [t.roofs, f.loc('4,200') + ' m²'],
    [t.ground, f.loc(640) + ' m²'],
    [t.edge, f.loc(380) + ' m'],
    [t.walls, f.loc('1,150') + ' m²'],
  ];

  return (
    <Screen>
      <ScreenHeader title={t.goalTitle} sub={t.goalSub} />

      <Card onPress={() => go('S05')} label={`${t.zoneSet}: Asad Gate block`} pad={10} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Photo src={ZONE_THUMB} style={{ width: 60, height: 60, borderRadius: R.md, backgroundColor: B.photoBg2 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Label>{t.zoneSet}</Label>
          <Txt size={15} w={600}>
            Asad Gate block
          </Txt>
          <Txt size={12} dim>
            {f.loc(t.zoneMeta)}
          </Txt>
        </View>
        <HeatBadge score={86} size={42} />
      </Card>

      <Card>
        <Label>{t.existing}</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={13} w={700}>
              HR
            </Txt>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={14} w={600}>
              Hall Rooftop Crew
            </Txt>
            <Txt size={12} dim>
              {f.dC(-1) + ' by Jun 2027 · ' + f.loc(6) + ' members'}
            </Txt>
          </View>
          <GhostButton label={t.join} height={40} onPress={() => go('S17')} />
        </View>
        <Txt size={12} dim>
          {t.existingNote}
        </Txt>
      </Card>

      <Card>
        <Label>{t.space}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {inv.map(([label, val]) => (
            <View key={label} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 0, backgroundColor: c.soft, borderRadius: R.md, padding: 12, gap: 2 }}>
              <Txt size={11.5} dim lines={1}>
                {label}
              </Txt>
              <Txt size={20} num lines={1} style={{ letterSpacing: -0.2 }}>
                {val}
              </Txt>
            </View>
          ))}
        </View>
        <Txt size={11} dim>
          {f.loc(t.spaceSrc)}
        </Txt>
      </Card>

      <Card>
        <Label>{t.target}</Label>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
          {T4.map((v, i) => {
            const on = plan.tgt === i;
            return (
              <Tap
                key={v}
                role="radio"
                selected={on}
                haptic
                label={f.dC(v) + (i === 2 ? `, ${t.rec}` : '')}
                onPress={() => setPlan({ tgt: i })}
                style={{ flex: 1, minWidth: 0, height: 56, borderRadius: R.md, backgroundColor: on ? B.lime : c.soft, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 }}>
                <Txt size={14} w={600} num lines={1} color={on ? B.limeInk : c.ink}>
                  {f.dC(v)}
                </Txt>
                {i === 2 ? (
                  <Txt size={9.5} w={600} lines={1} color={on ? B.limeInk : c.ink} style={{ letterSpacing: 0.3, textTransform: 'uppercase' }}>
                    {t.rec}
                  </Txt>
                ) : null}
              </Tap>
            );
          })}
        </View>
        <Txt size={12} dim>
          {f.dC(-1.5) + ' ' + t.recNote}
        </Txt>
        <Divider />
        <Label>{t.timeline}</Label>
        <Seg options={t.tls.map((label, i) => ({ label, value: i }))} value={plan.tl} onChange={(i) => setPlan({ tl: i })} height={40} />
        {actionGoal ? (
          <View style={{ backgroundColor: c.limeSoft, borderRadius: R.md, padding: 12 }}>
            <Txt size={12.5}>{t.actionNote}</Txt>
          </View>
        ) : null}
        <Txt size={12} dim>
          {t.goalDate + ' · '}
          <Txt size={12} w={600}>
            {goalDate}
          </Txt>
        </Txt>
      </Card>

      <CzButton label={t.checkFeas} icon="arrow" onPress={() => go('S09')} />
    </Screen>
  );
}
