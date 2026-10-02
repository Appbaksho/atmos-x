import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { I, Icon, Tap, Txt } from '@/components/cz/ui';
import { B, SHADOW } from '@/constants/cz';
import { useCz } from '@/context/prefs';

const NAV = {
  en: ['Home', 'Map', 'Plan', 'Community', 'Profile'],
  bn: ['হোম', 'মানচিত্র', 'পরিকল্পনা', 'কমিউনিটি', 'প্রোফাইল'],
  ur: ['ہوم', 'نقشہ', 'منصوبہ', 'کمیونٹی', 'پروفائل'],
} as const;
const FIELDS = { en: 'Fields', bn: 'জমি', ur: 'کھیت' } as const;
const ICONS = [I.home, I.map, I.plan, I.community, I.profile];

/** Floating pill tab bar from the prototype: 5 items, lime indicator on the active tab. */
function CzTabBar({ state, navigation }: BottomTabBarProps) {
  const { c, prefs } = useCz();
  const insets = useSafeAreaInsets();
  const labels: string[] = [...NAV[prefs.lang]];
  if (prefs.farmer) labels[1] = FIELDS[prefs.lang];
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 22 + Math.max(0, insets.bottom - 12),
          height: 66,
          borderRadius: 26,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 6,
        },
        SHADOW.card,
      ]}>
      {state.routes.map((route, i) => {
        const on = state.index === i;
        return (
          <Tap
            key={route.key}
            role="tab"
            selected={on}
            label={labels[i]}
            haptic
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ minWidth: 58, height: 56, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <View style={{ width: 44, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? B.lime : 'transparent' }}>
              <Icon d={ICONS[i]} size={20} sw={1.7} color={on ? B.limeInk : c.ink2} />
            </View>
            <Txt size={10.5} w={on ? 600 : 500} color={on ? c.ink : c.ink2} lines={1}>
              {labels[i]}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { c } = useCz();
  return (
    <Tabs tabBar={(p) => <CzTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
