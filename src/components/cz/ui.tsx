/**
 * CoolZone UI kit. Every screen is built from these so spacing, type, colour and touch behaviour
 * stay consistent. Rules baked in (ui-ux-pro-max): ≥44pt touch targets, visible press feedback,
 * haptics on primary actions, accessibility labels on icon-only controls, RTL-safe start/end spacing,
 * semantic colour tokens (never raw hex in screens unless it's a fixed brand colour from `B`).
 */
import SliderNative from '@react-native-community/slider';
import { Image, type ImageSource } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  type PressableProps,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { B, heatColor, heatFg, R, SHADOW, STACK_CLEARANCE, TAB_CLEARANCE, type Weight } from '@/constants/cz';
import { useCz } from '@/context/prefs';
import { goBack } from '@/lib/cz/routes';
import { BUTTON_GLYPH, type ButtonGlyph, I } from './icons';

export { I } from './icons';

const tap = () => Haptics.selectionAsync().catch(() => {});

/* ───────────────────────────── Icon ───────────────────────────── */

export function Icon({
  d,
  size = 20,
  color,
  sw = 1.8,
  fill = 'none',
}: {
  d: string;
  size?: number;
  color?: string;
  sw?: number;
  fill?: string;
}) {
  const { c } = useCz();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color ?? c.ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill={fill} />
    </Svg>
  );
}

/* ───────────────────────────── Text ───────────────────────────── */

export type TxtProps = {
  children?: React.ReactNode;
  size?: number;
  w?: Weight;
  color?: string;
  /** Secondary ink */
  dim?: boolean;
  /** Lemon/Milk display face (falls back for Bangla/Urdu) */
  display?: boolean;
  center?: boolean;
  /** Tabular figures for numbers that change */
  num?: boolean;
  /** Uppercase section label style */
  label?: boolean;
  lines?: number;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
  accessibilityRole?: 'header' | 'text';
};

export function Txt({ children, size = 14, w = 400, color, dim, display, center, num, label, lines, style, selectable, accessibilityRole }: TxtProps) {
  const { c, font, display: displayFace, prefs } = useCz();
  const fs = label ? 11 : size;
  const lh = Math.round(fs * (prefs.lang === 'ur' ? 1.9 : display ? 1.25 : 1.45));
  return (
    <Text
      numberOfLines={lines}
      selectable={selectable}
      accessibilityRole={accessibilityRole}
      allowFontScaling
      maxFontSizeMultiplier={1.6}
      style={[
        {
          color: color ?? (dim || label ? c.ink2 : c.ink),
          fontSize: fs,
          lineHeight: lh,
          fontFamily: display ? displayFace : font(label ? 600 : w),
          letterSpacing: display ? 0.3 : label ? 0.66 : 0,
          textTransform: label ? 'uppercase' : 'none',
          textAlign: center ? 'center' : undefined,
          fontVariant: num ? ['tabular-nums'] : undefined,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

/* ─────────────────────────── Pressables ─────────────────────────── */

/** Pressable with opacity + slight scale feedback. Use for any custom tappable surface. */
export function Tap({
  children,
  style,
  onPress,
  label,
  haptic,
  disabled,
  role = 'button',
  selected,
  hitSlop,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Accessibility label (required when the content is icon-only) */
  label?: string;
  haptic?: boolean;
  role?: 'button' | 'link' | 'tab' | 'radio' | 'checkbox' | 'switch';
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected, checked: role === 'checkbox' || role === 'radio' ? selected : undefined }}
      disabled={disabled}
      hitSlop={hitSlop ?? 4}
      onPress={(e) => {
        if (haptic) tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [style, { opacity: disabled ? 0.45 : pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      {...rest}>
      {children}
    </Pressable>
  );
}

/**
 * Primary pill CTA with the prototype's icon disc. One per screen.
 * lime (default) for main actions, navy for secondary emphasis.
 */
export function CzButton({
  label,
  onPress,
  icon = 'arrow',
  size = 'lg',
  variant = 'lime',
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  icon?: ButtonGlyph;
  size?: 'lg' | 'md' | 'sm';
  variant?: 'lime' | 'navy';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { font } = useCz();
  const [h, fs, iw] = { lg: [56, 16, 34], md: [46, 14, 28], sm: [38, 13, 24] }[size];
  const navy = variant === 'navy';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          height: Math.max(h, 44),
          borderRadius: 30,
          backgroundColor: navy ? (pressed ? B.navy2 : B.navy) : pressed ? B.limeHover : B.lime,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingStart: 8,
          paddingEnd: 20,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        SHADOW.button,
        style,
      ]}>
      <Svg width={iw} height={iw} viewBox="0 0 512 512">
        <Path d={BUTTON_GLYPH[icon]} fill={navy ? B.lime : B.limeInk} fillRule="evenodd" />
      </Svg>
      <Text numberOfLines={1} style={{ color: navy ? B.white : B.limeInk, fontSize: fs, fontFamily: font(600) }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Secondary outline pill (e.g. "See projection"). */
export function GhostButton({ label, onPress, style, height = 52 }: { label: string; onPress?: () => void; style?: StyleProp<ViewStyle>; height?: number }) {
  const { c } = useCz();
  return (
    <Tap
      label={label}
      onPress={onPress}
      style={[{ height, borderRadius: 30, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, style]}>
      <Txt size={height >= 50 ? 15 : 13.5} w={600}>
        {label}
      </Txt>
    </Tap>
  );
}

/** Small solid pill button (navy or lime), e.g. "Set goal", "Add to goal". */
export function PillButton({
  label,
  onPress,
  tone = 'navy',
  style,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'navy' | 'lime' | 'card';
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useCz();
  const bg = tone === 'navy' ? B.navy : tone === 'lime' ? B.lime : c.card;
  const fg = tone === 'navy' ? B.white : tone === 'lime' ? B.limeInk : c.ink;
  return (
    <Tap label={label} onPress={onPress} haptic style={[{ minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Txt size={12.5} w={600} color={fg} lines={1}>
        {label}
      </Txt>
    </Tap>
  );
}

/** 44pt round icon button. `tone`: card (default), glass (over photos), lime, navy. */
export function IconBtn({
  d,
  label,
  onPress,
  tone = 'card',
  size = 44,
  iconSize = 18,
  badge,
  style,
}: {
  d: string;
  label: string;
  onPress?: () => void;
  tone?: 'card' | 'glass' | 'glassDark' | 'lime' | 'navy';
  size?: number;
  iconSize?: number;
  /** Red unread dot */
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useCz();
  const T = {
    card: { bg: c.card, fg: c.ink, bd: 'transparent' },
    glass: { bg: B.glass, fg: B.white, bd: B.glassLine },
    glassDark: { bg: 'rgba(0,24,46,0.35)', fg: B.white, bd: B.glassLine },
    lime: { bg: B.lime, fg: B.limeInk, bd: 'transparent' },
    navy: { bg: B.navy, fg: B.lime, bd: 'transparent' },
  }[tone];
  return (
    <Tap
      label={label}
      onPress={onPress}
      haptic
      style={[
        {
          width: Math.max(size, 44),
          height: Math.max(size, 44),
          borderRadius: 999,
          backgroundColor: T.bg,
          borderWidth: tone.startsWith('glass') ? 1 : 0,
          borderColor: T.bd,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tone === 'lime' && SHADOW.button,
        style,
      ]}>
      <Icon d={d} size={iconSize} color={T.fg} sw={2} />
      {badge ? <View style={{ position: 'absolute', top: 10, end: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: B.red }} /> : null}
    </Tap>
  );
}

/**
 * Light status-bar content while this screen is focused — for screens whose top is a dark photo
 * hero or map. Unmounts when another screen is pushed so the theme default comes back.
 */
export function LightStatusBar() {
  return useIsFocused() ? <StatusBar style="light" /> : null;
}

/* ───────────────────────────── Layout ───────────────────────────── */

/**
 * Scrolling screen body. Adds the top safe-area inset (unless `bleed` — the first child is a
 * full-bleed photo that handles its own inset) and bottom clearance for the tab bar / Ask button.
 */
export function Screen({
  children,
  tab,
  bleed,
  gap = 14,
  padded = true,
  style,
  scrollRef,
  ...rest
}: ScrollViewProps & {
  children: React.ReactNode;
  /** True on the five tab roots (reserves room for the floating tab bar) */
  tab?: boolean;
  /** Content starts under the status bar (photo hero) */
  bleed?: boolean;
  gap?: number;
  /** Horizontal 16pt gutters */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  scrollRef?: React.Ref<ScrollView>;
}) {
  const { c } = useCz();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[
        {
          paddingTop: bleed ? 0 : insets.top + 12,
          paddingBottom: (tab ? TAB_CLEARANCE : STACK_CLEARANCE) + insets.bottom,
          paddingHorizontal: padded && !bleed ? 16 : 0,
          gap,
        },
        style,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}>
      {children}
    </ScrollView>
  );
}

/** Screen title row: back button, display title + subtitle, optional trailing control. */
export function ScreenHeader({
  title,
  sub,
  right,
  onBack,
  back = true,
  big,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  back?: boolean;
  /** Larger title for tab roots (no back button) */
  big?: boolean;
}) {
  const { f } = useCz();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: big ? 4 : 0 }}>
      {back ? <IconBtn d={f.backPath} label="Back" onPress={onBack ?? goBack} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Txt display size={big ? 21 : 17} accessibilityRole="header">
          {title}
        </Txt>
        {sub ? (
          <Txt size={12} dim>
            {sub}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Section title (display face) with an optional link-style action. */
export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useCz();
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }, style]}>
      <Txt display size={14} style={{ flexShrink: 1 }}>
        {title}
      </Txt>
      {action ? (
        <Tap role="link" label={action} onPress={onAction} hitSlop={12} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Txt size={13} w={600} color={c.leaf}>
            {action}
          </Txt>
        </Tap>
      ) : null}
    </View>
  );
}

/** Uppercase caption. */
export function Label({ children, style, color }: { children: React.ReactNode; style?: StyleProp<TextStyle>; color?: string }) {
  return (
    <Txt label style={style} color={color}>
      {children}
    </Txt>
  );
}

/** Card surface (radius 24, padding 16). */
export function Card({
  children,
  style,
  onPress,
  label,
  tone = 'card',
  pad = 16,
  gap = 12,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  label?: string;
  /** card | navy (dark hero card) | soft | limeSoft */
  tone?: 'card' | 'navy' | 'soft' | 'limeSoft';
  pad?: number;
  gap?: number;
}) {
  const { c } = useCz();
  const bg = tone === 'navy' ? B.navy : tone === 'soft' ? c.soft : tone === 'limeSoft' ? c.limeSoft : c.card;
  const body = [{ backgroundColor: bg, borderRadius: R.xl, padding: pad, gap }, tone === 'navy' && c.dark && { borderWidth: 1, borderColor: c.line }, style];
  if (!onPress) return <View style={body}>{children}</View>;
  return (
    <Tap label={label} onPress={onPress} style={body}>
      {children}
    </Tap>
  );
}

/** Hairline divider. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useCz();
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }, style]} />;
}

/** List row inside a card. Pass `last` to drop the bottom divider. */
export function ListRow({
  children,
  onPress,
  last,
  label,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useCz();
  const s = [
    { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 10, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line },
    style,
  ];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Tap label={label} onPress={onPress} style={s}>
      {children}
    </Tap>
  );
}

/* ─────────────────────────── Controls ─────────────────────────── */

export type SegOption<V> = { label: string; value: V };

/** Segmented pill control (active segment = lime). */
export function Seg<V extends string | number | boolean>({
  options,
  value,
  onChange,
  tone = 'soft',
  height = 38,
  style,
}: {
  options: SegOption<V>[];
  value: V;
  onChange: (v: V) => void;
  /** soft (inside a card) | card (on page bg) | glass (over photos) */
  tone?: 'soft' | 'card' | 'glass';
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useCz();
  const bg = tone === 'soft' ? c.soft : tone === 'card' ? c.card : B.glassDark;
  return (
    <View
      accessibilityRole="tablist"
      style={[{ flexDirection: 'row', padding: 3, borderRadius: R.pill, backgroundColor: bg }, tone === 'glass' && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={String(o.value)}
            role="tab"
            selected={on}
            label={o.label}
            haptic
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: Math.max(height, 32), paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: on ? B.lime : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={12.5} w={600} lines={1} color={on ? B.limeInk : tone === 'glass' ? B.white : c.ink2}>
              {o.label}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

/** Toggle chip (filters). Active = navy fill. */
export function FilterChip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { c } = useCz();
  return (
    <Tap
      role="checkbox"
      selected={active}
      label={label}
      haptic
      onPress={onPress}
      style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: active ? B.navy : c.card, justifyContent: 'center' }}>
      <Txt size={12.5} w={600} color={active ? B.white : c.ink}>
        {label}
      </Txt>
    </Tap>
  );
}

/** Static tag / badge. */
export function Tag({
  label,
  bg,
  fg,
  dot,
  size = 'sm',
  style,
}: {
  label: string;
  bg?: string;
  fg?: string;
  dot?: string;
  size?: 'xs' | 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useCz();
  const [h, fs] = { xs: [20, 10.5], sm: [24, 11], md: [30, 12] }[size];
  return (
    <View style={[{ alignSelf: 'flex-start', height: h, paddingHorizontal: 9, borderRadius: R.pill, backgroundColor: bg ?? c.soft, flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Txt size={fs} w={700} color={fg ?? c.ink} lines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Translucent chip for use over photos. */
export function GlassPill({ children, style, dark }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: dark ? 'rgba(0,24,46,0.5)' : B.glass, borderWidth: 1, borderColor: dark ? 'rgba(255,255,255,0.35)' : B.glassLine },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Heat Score disc. */
export function HeatBadge({ score, size = 36, label }: { score: number; size?: number; label?: string }) {
  const { f, font } = useCz();
  return (
    <View
      accessible
      accessibilityLabel={label ?? `Heat Score ${score}`}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: heatColor(score), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: heatFg(score), fontFamily: font(700), fontSize: Math.round(size * 0.33) }}>{f.loc(score)}</Text>
    </View>
  );
}

/** Initials avatar. */
export function Avatar({ ini, bg, fg, size = 36, square }: { ini: string; bg: string; fg: string; size?: number; square?: boolean }) {
  const { font } = useCz();
  return (
    <View style={{ width: size, height: size, borderRadius: square ? 12 : size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontFamily: font(700), fontSize: Math.round(size * 0.32) }}>{ini}</Text>
    </View>
  );
}

/** Progress ring. `pct` 0–100. Children are centred inside. */
export function Ring({
  pct,
  size = 72,
  stroke = 9,
  color,
  track,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const { c } = useCz();
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.soft} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? c.leaf}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(C * Math.max(0, Math.min(100, pct))) / 100} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

/** Horizontal progress bar. `pct` 0–100; optional marker (e.g. city average). */
export function Bar({ pct, color, height = 8, track, marker, style }: { pct: number; color?: string; height?: number; track?: string; marker?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useCz();
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track ?? c.soft }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: height / 2, backgroundColor: color ?? c.leaf }} />
      {marker != null ? <View style={{ position: 'absolute', top: -4, start: `${marker}%`, width: 3, height: height + 8, borderRadius: 2, backgroundColor: c.ink }} /> : null}
    </View>
  );
}

/** Slider (lime thumb, accent track). */
export function CzSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  style,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, f } = useCz();
  return (
    <SliderNative
      accessibilityLabel={label}
      style={[{ height: 40, flex: 1 }, style]}
      minimumValue={min}
      maximumValue={max}
      step={step}
      value={value}
      inverted={f.rtl}
      onValueChange={onChange}
      minimumTrackTintColor={c.leaf}
      maximumTrackTintColor={c.soft}
      thumbTintColor={c.dark ? B.lime : B.blue}
    />
  );
}

/** − value + stepper. */
export function Stepper({ value, onDec, onInc, label }: { value: string; onDec: () => void; onInc: () => void; label: string }) {
  const { c } = useCz();
  const btn = (t: string, on: () => void, a11y: string) => (
    <Tap label={a11y} onPress={on} haptic style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={20}>{t}</Txt>
    </Tap>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: R.pill, backgroundColor: c.soft }}>
      {btn('−', onDec, `Decrease ${label}`)}
      <Txt size={16} w={600} num center style={{ minWidth: 30 }}>
        {value}
      </Txt>
      {btn('+', onInc, `Increase ${label}`)}
    </View>
  );
}

/** Radio dot (used inside option rows). */
export function RadioDot({ on }: { on: boolean }) {
  const { c } = useCz();
  const col = c.dark ? B.lime : B.blue;
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? col : c.ink2, alignItems: 'center', justifyContent: 'center' }}>
      {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: col }} /> : null}
    </View>
  );
}

/** Selectable option card with radio (credit picker, sensor build…). */
export function OptionRow({
  title,
  sub,
  extra,
  selected,
  onPress,
}: {
  title: string;
  sub?: string;
  extra?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useCz();
  const col = c.dark ? B.lime : B.blue;
  return (
    <Tap
      role="radio"
      selected={selected}
      label={title}
      haptic
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 18, backgroundColor: c.card, borderWidth: 2, borderColor: selected ? col : 'transparent' }}>
      <View style={{ marginTop: 1 }}>
        <RadioDot on={selected} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={13.5} w={600}>
          {title}
        </Txt>
        {sub ? (
          <Txt size={11.5} dim>
            {sub}
          </Txt>
        ) : null}
        {extra ? <Txt size={11.5}>{extra}</Txt> : null}
      </View>
    </Tap>
  );
}

/** Square checkbox. */
export function Check({ on, color = B.lime }: { on: boolean; color?: string }) {
  const { c } = useCz();
  return (
    <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: on ? color : c.ink2, backgroundColor: on ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Icon d={I.check} size={12} color={B.limeInk} sw={3.2} /> : null}
    </View>
  );
}

/** Text input with visible label. */
export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  const { c, font } = useCz();
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.ink2}
        style={[{ height: 50, borderRadius: R.md, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.bg, color: c.ink, paddingHorizontal: 14, fontFamily: font(500), fontSize: 15 }, style]}
        {...rest}
      />
    </View>
  );
}

/** Stat tile (label over value) on a soft surface. */
export function StatTile({ label, value, sub, color, big, style }: { label: string; value: string; sub?: string; color?: string; big?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useCz();
  return (
    <View style={[{ flex: 1, minWidth: 0, backgroundColor: c.soft, borderRadius: 14, padding: 10, gap: 2 }, style]}>
      <Txt size={10.5} dim lines={1}>
        {label}
      </Txt>
      <Txt size={big ? 24 : 15} w={big ? 400 : 600} num color={color} lines={1} style={big ? { letterSpacing: -0.5 } : undefined}>
        {value}
      </Txt>
      {sub ? (
        <Txt size={10.5} dim lines={1}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/* ───────────────────────────── Media ───────────────────────────── */

/**
 * Photo with optional navy gradient scrim. `stops` are [offset, alpha] pairs from top to bottom.
 */
export function Photo({
  src,
  style,
  scrim,
  children,
  label,
}: {
  src: string | ImageSource;
  style?: StyleProp<ViewStyle>;
  scrim?: [number, number][];
  children?: React.ReactNode;
  /** Accessibility description of the photo */
  label?: string;
}) {
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: B.photoBg }, style]}>
      <Image
        source={typeof src === 'string' ? { uri: src } : src}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={250}
        accessibilityLabel={label}
        accessible={!!label}
      />
      {scrim ? (
        <LinearGradient
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          colors={scrim.map(([, a]) => `rgba(0,16,32,${a})`) as [string, string, ...string[]]}
          locations={scrim.map(([o]) => o) as [number, number, ...number[]]}
        />
      ) : null}
      {children}
    </View>
  );
}

/** Info / advice strip on lime-soft (or warn on orange-soft). */
export function Note({ children, tone = 'lime', icon }: { children: React.ReactNode; tone?: 'lime' | 'warn' | 'danger' | 'navy'; icon?: string }) {
  const { c } = useCz();
  const bg = tone === 'lime' ? c.limeSoft : tone === 'warn' ? 'rgba(255,126,0,0.16)' : tone === 'danger' ? B.deepRed : B.navy;
  const fg = tone === 'danger' || tone === 'navy' ? B.white : c.ink;
  const ic = tone === 'warn' ? B.orangeInk : tone === 'lime' ? c.leaf : fg;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: bg }}>
      {icon ? <Icon d={icon} size={18} color={ic} sw={2} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>{typeof children === 'string' ? <Txt size={12.5} color={fg}>{children}</Txt> : children}</View>
    </View>
  );
}
