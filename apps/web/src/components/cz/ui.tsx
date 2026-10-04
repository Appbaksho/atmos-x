'use client';
/**
 * CoolZone UI kit (web). Port of apps/mobile/src/components/cz/ui.tsx with the same export names
 * and props, so screens translate almost line by line. Rules baked in: ≥44 px touch targets,
 * visible press feedback, navigator.vibrate on primary actions, aria labels on icon-only controls,
 * RTL-safe logical properties, semantic colour tokens (never raw hex in screens unless it's a fixed
 * brand colour from `B`).
 *
 * Web differences (see docs/handoff/v0-1.md):
 * - `style` takes an RN-style object or array (see ./style.ts); RN keys such as paddingHorizontal,
 *   start/end and numeric lineHeight are converted. `className` is accepted too (Tailwind).
 * - `onPress` handlers receive the DOM click event. `Tap`, `IconBtn`, `PillButton`, `GhostButton`,
 *   `CzButton` and `Card` also take `href` (renders a locale-aware <Link>).
 * - `<View>` replaces RN's View (div with react-native-web defaults).
 */
import { useTranslations } from 'next-intl';
import React, { useEffect, useId, useState } from 'react';

import { Link } from '@/i18n/navigation';
import { goBack } from '@/lib/routes';
import { useCz } from '@/lib/prefs';

import { haptic as vibrate } from './hooks';
import { BUTTON_GLYPH, I, type ButtonGlyph } from './icons';
import { absoluteFill, rn, type CzStyle, type StyleProp } from './style';
import { B, heatColor, heatFg, R, SHADOW, type Weight } from './tokens';

export { I, BUTTON_GLYPH, type ButtonGlyph } from './icons';
export type { CzStyle, StyleProp } from './style';

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
const tap = () => vibrate(8);

/* ───────────────────────────── View ───────────────────────────── */

export type ViewProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'role'> & {
  style?: StyleProp;
  /** aria-label */
  label?: string;
  role?: React.AriaRole;
  ref?: React.Ref<HTMLDivElement>;
};

/** RN View: a flex-column div with react-native-web's defaults. */
export function View({ style, className, label, ...rest }: ViewProps) {
  return <div className={cx('cz-view', className)} aria-label={label} style={rn(style)} {...rest} />;
}

/** Horizontal scroller (RN `<ScrollView horizontal>`); scrollbar hidden, gutters optional. */
export function HScroll({
  children,
  gap = 10,
  padded = true,
  style,
  className,
  label,
}: {
  children: React.ReactNode;
  gap?: number;
  /** Bleed to the screen edge with 16 px inner gutters (cancel the Screen padding) */
  padded?: boolean;
  style?: StyleProp;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role={label ? 'region' : undefined}
      aria-label={label}
      className={cx('cz-hscroll', className)}
      style={rn([{ display: 'flex', flexDirection: 'row', gap, overflowX: 'auto', marginInline: padded ? -16 : 0, paddingInline: padded ? 16 : 0 }, style])}>
      {children}
    </div>
  );
}

/* ───────────────────────────── Icon ───────────────────────────── */

export function Icon({
  d,
  size = 20,
  color,
  sw = 1.8,
  fill = 'none',
  style,
  label,
}: {
  d: string;
  size?: number;
  color?: string;
  sw?: number;
  fill?: string;
  style?: StyleProp;
  /** Accessible name; omit for decorative icons (hidden from assistive tech) */
  label?: string;
}) {
  const { c } = useCz();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flexShrink: 0, ...rn(style) }}>
      <path d={d} stroke={color ?? c.ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill={fill} />
    </svg>
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
  /** Lemon/Milk display face (falls back to the body face at 600 for non-Latin scripts) */
  display?: boolean;
  center?: boolean;
  /** Tabular figures for numbers that change */
  num?: boolean;
  /** Uppercase section label style */
  label?: boolean;
  /** Max lines (ellipsis) */
  lines?: number;
  style?: StyleProp;
  className?: string;
  selectable?: boolean;
  /** 'header' renders an <h2> (or use `as`) */
  accessibilityRole?: 'header' | 'text';
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'label' | 'strong';
  id?: string;
  htmlFor?: string;
};

export function Txt({ children, size = 14, w = 400, color, dim, display, center, num, label, lines, style, className, selectable, accessibilityRole, as, id, htmlFor }: TxtProps) {
  const { c, fw, lang } = useCz();
  const fs = label ? 11 : size;
  const lh = Math.round(fs * (lang === 'ur' ? 1.9 : display ? 1.25 : 1.45));
  const El = (as ?? (accessibilityRole === 'header' ? 'h2' : 'span')) as React.ElementType;
  const face: React.CSSProperties = display
    ? { fontFamily: 'var(--cz-font-display)', fontWeight: 'var(--cz-display-weight)' as React.CSSProperties['fontWeight'] }
    : fw(label ? 600 : w);
  const clamp: React.CSSProperties =
    lines === 1
      ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, display: 'block' }
      : lines && lines > 1
        ? { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', minWidth: 0 }
        : {};
  return (
    <El
      id={id}
      htmlFor={htmlFor}
      className={cx('cz-txt', className)}
      style={{
        color: color ?? (dim || label ? c.ink2 : c.ink),
        fontSize: fs,
        lineHeight: `${lh}px`,
        ...face,
        letterSpacing: display ? 0.3 : label ? 0.66 : 0,
        textTransform: label ? 'uppercase' : undefined,
        textAlign: center ? 'center' : undefined,
        fontVariantNumeric: num ? 'tabular-nums' : undefined,
        userSelect: selectable === false ? 'none' : undefined,
        ...clamp,
        ...rn(style),
      }}>
      {children}
    </El>
  );
}

/* ─────────────────────────── Pressables ─────────────────────────── */

export type TapRole = 'button' | 'link' | 'tab' | 'radio' | 'checkbox' | 'switch' | 'menuitem' | 'option';

export type TapProps = {
  children?: React.ReactNode;
  style?: StyleProp;
  className?: string;
  onPress?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Accessibility label (required when the content is icon-only) */
  label?: string;
  haptic?: boolean;
  disabled?: boolean;
  role?: TapRole;
  selected?: boolean;
  /** Locale-less internal path (rendered as next-intl <Link>) or an absolute URL */
  href?: string;
  /** Open `href` in a new tab (default for absolute http(s) URLs) */
  external?: boolean;
  /** Kept for RN parity; ignored on the web */
  hitSlop?: number;
  type?: 'button' | 'submit' | 'reset';
  id?: string;
  title?: string;
  tabIndex?: number;
  'aria-controls'?: string;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: React.AriaAttributes['aria-haspopup'];
  'aria-describedby'?: string;
  ref?: React.Ref<HTMLButtonElement>;
};

/** Pressable with opacity + slight scale feedback. Use for any custom tappable surface. */
export function Tap({ children, style, className, onPress, label, haptic, disabled, role = 'button', selected, href, external, hitSlop: _hitSlop, type = 'button', ref, ...rest }: TapProps) {
  void _hitSlop;
  const cls = cx('cz-view cz-tap', className);
  const st = rn(style);
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    if (haptic) tap();
    onPress?.(e);
  };
  const checked = role === 'checkbox' || role === 'radio' || role === 'switch' ? !!selected : undefined;
  const aria = {
    'aria-label': label,
    'aria-selected': role === 'tab' || role === 'option' ? !!selected : undefined,
    'aria-checked': checked,
    'aria-current': role === 'link' && selected ? ('page' as const) : undefined,
    'aria-disabled': disabled || undefined,
  };
  if (href) {
    const isExternal = external ?? /^(https?:|mailto:|tel:|geo:)/.test(href);
    if (isExternal || /^[a-z]+:/i.test(href)) {
      return (
        <a
          href={disabled ? undefined : href}
          className={cls}
          style={st}
          onClick={onClick}
          target={external ?? /^https?:/.test(href) ? '_blank' : undefined}
          rel="noopener noreferrer"
          role={role === 'button' || role === 'link' ? undefined : role}
          {...aria}
          id={rest.id}
          title={rest.title}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} style={st} onClick={onClick} role={role === 'link' ? undefined : role} {...aria} id={rest.id} title={rest.title}>
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} style={st} onClick={onClick} disabled={disabled} role={role === 'button' ? undefined : role} {...aria} {...rest}>
      {children}
    </button>
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
  busy,
  style,
  href,
  type,
}: {
  label: string;
  onPress?: () => void;
  icon?: ButtonGlyph;
  size?: 'lg' | 'md' | 'sm';
  variant?: 'lime' | 'navy';
  disabled?: boolean;
  /** Shows a spinner in the icon disc and disables the button */
  busy?: boolean;
  style?: StyleProp;
  href?: string;
  type?: 'button' | 'submit';
}) {
  const { fw, f } = useCz();
  const [h, fs, iw] = ({ lg: [56, 16, 34], md: [46, 14, 28], sm: [38, 13, 24] } as const)[size];
  const navy = variant === 'navy';
  const flip = icon === 'arrow' && f.rtl;
  return (
    <Tap
      label={label}
      href={href}
      type={type}
      disabled={disabled || busy}
      onPress={() => {
        vibrate(12);
        onPress?.();
      }}
      className={cx('cz-btn', navy ? 'cz-btn-navy' : 'cz-btn-lime')}
      style={[
        {
          height: Math.max(h, 44),
          borderRadius: 30,
          backgroundColor: navy ? B.navy : B.lime,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingStart: 8,
          paddingEnd: 20,
        },
        SHADOW.button,
        style,
      ]}>
      {busy ? (
        <Spinner size={iw} color={navy ? B.lime : B.limeInk} />
      ) : (
        <svg width={iw} height={iw} viewBox="0 0 512 512" aria-hidden focusable="false" style={{ flexShrink: 0, transform: flip ? 'scaleX(-1)' : undefined }}>
          <path d={BUTTON_GLYPH[icon]} fill={navy ? B.lime : B.limeInk} fillRule="evenodd" />
        </svg>
      )}
      <span style={{ color: navy ? B.white : B.limeInk, fontSize: fs, ...fw(600), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}</span>
    </Tap>
  );
}

/** Secondary outline pill (e.g. "See projection"). */
export function GhostButton({ label, onPress, style, height = 52, href, disabled, color }: { label: string; onPress?: () => void; style?: StyleProp; height?: number; href?: string; disabled?: boolean; /** Text colour (e.g. B.white on navy) */ color?: string }) {
  const { c } = useCz();
  return (
    <Tap
      label={label}
      onPress={onPress}
      href={href}
      disabled={disabled}
      style={[{ height, borderRadius: 30, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, style]}>
      <Txt size={height >= 50 ? 15 : 13.5} w={600} lines={1} color={color}>
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
  href,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'navy' | 'lime' | 'card';
  style?: StyleProp;
  href?: string;
  disabled?: boolean;
}) {
  const { c } = useCz();
  const bg = tone === 'navy' ? B.navy : tone === 'lime' ? B.lime : c.card;
  const fg = tone === 'navy' ? B.white : tone === 'lime' ? B.limeInk : c.ink;
  return (
    <Tap
      label={label}
      onPress={onPress}
      href={href}
      disabled={disabled}
      haptic
      style={[{ minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Txt size={12.5} w={600} color={fg} lines={1}>
        {label}
      </Txt>
    </Tap>
  );
}

/** 44 px round icon button. `tone`: card (default), glass (over photos), lime, navy. */
export function IconBtn({
  d,
  label,
  onPress,
  tone = 'card',
  size = 44,
  iconSize = 18,
  badge,
  style,
  href,
  disabled,
  selected,
  role,
}: {
  d: string;
  label: string;
  onPress?: () => void;
  tone?: 'card' | 'glass' | 'glassDark' | 'lime' | 'navy';
  size?: number;
  iconSize?: number;
  /** Red unread dot */
  badge?: boolean;
  style?: StyleProp;
  href?: string;
  disabled?: boolean;
  selected?: boolean;
  role?: TapRole;
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
      href={href}
      disabled={disabled}
      selected={selected}
      role={role}
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
          flexShrink: 0,
        },
        tone === 'lime' && SHADOW.button,
        style,
      ]}>
      <Icon d={d} size={iconSize} color={T.fg} sw={2} />
      {badge ? <span aria-hidden style={{ position: 'absolute', top: 10, insetInlineEnd: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: B.red }} /> : null}
    </Tap>
  );
}

/**
 * Navy browser chrome (theme-color) while this screen is mounted: for screens whose top is a
 * dark photo hero or map. Restores the theme default on unmount.
 */
export function LightStatusBar() {
  useEffect(() => {
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const prev = metas.map((m) => m.getAttribute('content'));
    metas.forEach((m) => m.setAttribute('content', B.navy));
    return () => metas.forEach((m, i) => m.setAttribute('content', prev[i] ?? ''));
  }, []);
  return null;
}

/* ───────────────────────────── Layout ───────────────────────────── */

/**
 * Screen body. Adds the top safe-area inset (unless `bleed`: the first child is a full-bleed
 * photo that handles its own inset) and bottom clearance for the tab bar / Ask button.
 * The window scrolls (not an inner container), so mobile browser chrome collapses naturally.
 * At ≥ 1024 px the column is centred with a max width unless `wide`.
 */
export function Screen({
  children,
  tab,
  bleed,
  gap = 14,
  padded = true,
  style,
  className,
  scrollRef,
  wide,
}: {
  children: React.ReactNode;
  /** True on the five tab roots (reserves room for the floating tab bar) */
  tab?: boolean;
  /** Content starts at the very top (photo hero) */
  bleed?: boolean;
  gap?: number;
  /** Horizontal 16 px gutters */
  padded?: boolean;
  style?: StyleProp;
  className?: string;
  scrollRef?: React.Ref<HTMLElement>;
  /** No max width on desktop (map two-pane, galleries) */
  wide?: boolean;
}) {
  return (
    <main
      id="main"
      ref={scrollRef}
      className={cx('cz-view cz-screen', tab ? 'cz-screen-tab' : 'cz-screen-stack', !wide && 'cz-screen-narrow', className)}
      style={rn([
        {
          paddingTop: bleed ? 0 : 'calc(env(safe-area-inset-top, 0px) + 12px)',
          paddingHorizontal: padded && !bleed ? 16 : 0,
          gap,
        },
        style,
      ])}>
      {children}
    </main>
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
  const t = useTranslations('common');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: big ? 4 : 0 }}>
      {back ? <IconBtn d={f.backPath} label={t('back')} onPress={onBack ?? goBack} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Txt display size={big ? 21 : 17} as="h1">
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
export function SectionTitle({ title, action, onAction, actionHref, style }: { title: string; action?: string; onAction?: () => void; actionHref?: string; style?: StyleProp }) {
  const { c } = useCz();
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, gap: 8 }, style]}>
      <Txt display size={14} as="h2" style={{ flexShrink: 1 }}>
        {title}
      </Txt>
      {action ? (
        <Tap role="link" label={action} onPress={onAction} href={actionHref} style={{ minHeight: 32, justifyContent: 'center', flexShrink: 0 }}>
          <Txt size={13} w={600} color={c.leaf}>
            {action}
          </Txt>
        </Tap>
      ) : null}
    </View>
  );
}

/** Uppercase caption. */
export function Label({ children, style, color }: { children: React.ReactNode; style?: StyleProp; color?: string }) {
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
  className,
  onPress,
  href,
  label,
  tone = 'card',
  pad = 16,
  gap = 12,
}: {
  children: React.ReactNode;
  style?: StyleProp;
  className?: string;
  onPress?: () => void;
  href?: string;
  label?: string;
  /** card | navy (dark hero card) | soft | limeSoft */
  tone?: 'card' | 'navy' | 'soft' | 'limeSoft';
  pad?: number;
  gap?: number;
}) {
  const { c } = useCz();
  const bg = tone === 'navy' ? B.navy : tone === 'soft' ? c.soft : tone === 'limeSoft' ? c.limeSoft : c.card;
  const body: StyleProp = [{ backgroundColor: bg, borderRadius: R.xl, padding: pad, gap }, tone === 'navy' && c.dark && { borderWidth: 1, borderColor: c.line }, style];
  if (!onPress && !href)
    return (
      <View style={body} className={className} label={label} role={label ? 'group' : undefined}>
        {children}
      </View>
    );
  return (
    <Tap label={label} onPress={onPress} href={href} style={[{ textAlign: 'start' }, body]} className={className}>
      {children}
    </Tap>
  );
}

/** Hairline divider. */
export function Divider({ style }: { style?: StyleProp }) {
  const { c } = useCz();
  return <div role="separator" className="cz-view" style={rn([{ height: 1, backgroundColor: c.line }, style])} />;
}

/** List row inside a card. Pass `last` to drop the bottom divider. */
export function ListRow({
  children,
  onPress,
  href,
  last,
  label,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  href?: string;
  last?: boolean;
  label?: string;
  style?: StyleProp;
}) {
  const { c } = useCz();
  const s: StyleProp = [
    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line, textAlign: 'start' },
    style,
  ];
  if (!onPress && !href) return <View style={s}>{children}</View>;
  return (
    <Tap label={label} onPress={onPress} href={href} style={s}>
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
  label,
}: {
  options: SegOption<V>[];
  value: V;
  onChange: (v: V) => void;
  /** soft (inside a card) | card (on page bg) | glass (over photos) */
  tone?: 'soft' | 'card' | 'glass';
  height?: number;
  style?: StyleProp;
  /** aria-label of the group */
  label?: string;
}) {
  const { c } = useCz();
  const bg = tone === 'soft' ? c.soft : tone === 'card' ? c.card : B.glassDark;
  return (
    <View
      role="tablist"
      label={label}
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
            style={{ flex: 1, minWidth: 0, minHeight: Math.max(height, 32), paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: on ? B.lime : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
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
export function FilterChip({ label, active, onPress, style }: { label: string; active?: boolean; onPress?: () => void; style?: StyleProp }) {
  const { c } = useCz();
  return (
    <Tap
      role="checkbox"
      selected={active}
      label={label}
      haptic
      onPress={onPress}
      style={[{ minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: active ? B.navy : c.card, justifyContent: 'center', flexShrink: 0 }, style]}>
      <Txt size={12.5} w={600} color={active ? B.white : c.ink} lines={1}>
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
  style?: StyleProp;
}) {
  const { c } = useCz();
  const [h, fs] = ({ xs: [20, 10.5], sm: [24, 11], md: [30, 12] } as const)[size];
  return (
    <View style={[{ alignSelf: 'flex-start', height: h, paddingHorizontal: 9, borderRadius: R.pill, backgroundColor: bg ?? c.soft, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }, style]}>
      {dot ? <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot, flexShrink: 0 }} /> : null}
      <Txt size={fs} w={700} color={fg ?? c.ink} lines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Translucent chip for use over photos. */
export function GlassPill({ children, style, dark }: { children: React.ReactNode; style?: StyleProp; dark?: boolean }) {
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
  const { f, fw } = useCz();
  const t = useTranslations('common');
  return (
    <div
      role="img"
      aria-label={label ?? t('heatScoreA11y', { score: f.loc(score) })}
      className="cz-view"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: heatColor(score), alignItems: 'center', justifyContent: 'center' }}>
      <span aria-hidden style={{ color: heatFg(score), ...fw(700), fontSize: Math.round(size * 0.33), lineHeight: 1 }}>
        {f.loc(score)}
      </span>
    </div>
  );
}

/** Initials avatar. */
export function Avatar({ ini, bg, fg, size = 36, square, src, label }: { ini: string; bg: string; fg: string; size?: number; square?: boolean; src?: string | null; label?: string }) {
  const { fw } = useCz();
  return (
    <div
      className="cz-view"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size, borderRadius: square ? 12 : size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: fg, ...fw(700), fontSize: Math.round(size * 0.32), lineHeight: 1 }}>{ini}</span>
      )}
    </div>
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
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const { c } = useCz();
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="cz-view" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} aria-hidden focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.soft} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? c.leaf}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(C * p) / 100} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="cz-view" style={{ ...rn(absoluteFill), alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/** Horizontal progress bar. `pct` 0–100; optional marker (e.g. city average). */
export function Bar({ pct, color, height = 8, track, marker, style, label }: { pct: number; color?: string; height?: number; track?: string; marker?: number; style?: StyleProp; label?: string }) {
  const { c } = useCz();
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="cz-view"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p)}
      style={rn([{ height, borderRadius: height / 2, backgroundColor: track ?? c.soft }, style])}>
      <div style={{ width: `${p}%`, height: '100%', borderRadius: height / 2, backgroundColor: color ?? c.leaf, transition: 'width 0.5s ease' }} />
      {marker != null ? <div aria-hidden style={{ position: 'absolute', top: -4, insetInlineStart: `${marker}%`, width: 3, height: height + 8, borderRadius: 2, backgroundColor: c.ink }} /> : null}
    </div>
  );
}

/** Slider (accent thumb, leaf track). Native range input: keyboard, RTL and touch work. */
export function CzSlider({
  value,
  onChange,
  onSlidingComplete,
  min,
  max,
  step = 1,
  label,
  valueText,
  style,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Fired once when the user releases the thumb / finishes a key press */
  onSlidingComplete?: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  /** aria-valuetext, e.g. "500 m" */
  valueText?: string;
  style?: StyleProp;
  disabled?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const done = (e: React.SyntheticEvent<HTMLInputElement>) => onSlidingComplete?.(Number(e.currentTarget.value));
  return (
    <input
      type="range"
      className="cz-slider"
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={done}
      onKeyUp={done}
      style={{ ...rn([{ height: 40, flex: 1, minWidth: 0 }, style]), ['--fill' as string]: `${pct}%` }}
    />
  );
}

/** − value + stepper. */
export function Stepper({ value, onDec, onInc, label, decDisabled, incDisabled }: { value: string; onDec: () => void; onInc: () => void; label: string; decDisabled?: boolean; incDisabled?: boolean }) {
  const { c } = useCz();
  const t = useTranslations('common');
  const btn = (txt: string, on: () => void, a11y: string, dis?: boolean) => (
    <Tap label={a11y} onPress={on} haptic disabled={dis} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={20}>{txt}</Txt>
    </Tap>
  );
  return (
    <View role="group" label={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: R.pill, backgroundColor: c.soft, alignSelf: 'flex-start' }}>
      {btn('−', onDec, t('decrease', { label }), decDisabled)}
      <Txt size={16} w={600} num center style={{ minWidth: 30 }}>
        <span aria-live="polite">{value}</span>
      </Txt>
      {btn('+', onInc, t('increase', { label }), incDisabled)}
    </View>
  );
}

/** Radio dot (used inside option rows). */
export function RadioDot({ on }: { on: boolean }) {
  const { c } = useCz();
  const col = c.accent;
  return (
    <span aria-hidden className="cz-view" style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? col : c.ink2}`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {on ? <span style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: col }} /> : null}
    </span>
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
  const col = c.accent;
  return (
    <Tap
      role="radio"
      selected={selected}
      label={title}
      haptic
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 18, backgroundColor: c.card, borderWidth: 2, borderColor: selected ? col : 'transparent', textAlign: 'start' }}>
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

/** Square checkbox (visual only; wrap in a Tap role="checkbox"). */
export function Check({ on, color = B.lime }: { on: boolean; color?: string }) {
  const { c } = useCz();
  return (
    <span
      aria-hidden
      className="cz-view"
      style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${on ? color : c.ink2}`, backgroundColor: on ? color : 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {on ? <Icon d={I.check} size={12} color={B.limeInk} sw={3.2} /> : null}
    </span>
  );
}

type KeyboardType = 'default' | 'email-address' | 'numeric' | 'number-pad' | 'decimal-pad' | 'phone-pad' | 'url';
const INPUT_MODE: Record<KeyboardType, React.HTMLAttributes<HTMLInputElement>['inputMode']> = {
  default: 'text',
  'email-address': 'email',
  numeric: 'numeric',
  'number-pad': 'numeric',
  'decimal-pad': 'decimal',
  'phone-pad': 'tel',
  url: 'url',
};

export type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement & HTMLTextAreaElement>, 'style' | 'onChange'> & {
  label: string;
  /** RN-style text callback */
  onChangeText?: (text: string) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardType;
  multiline?: boolean;
  /** Error text shown under the input (sets aria-invalid) */
  error?: string | null;
  /** Helper text under the input */
  hint?: string;
  style?: StyleProp;
  containerStyle?: StyleProp;
  /** Accepted for RN parity; ignored */
  autoCapitalize?: string;
  textContentType?: string;
  placeholderTextColor?: string;
};

/** Text input with visible label. */
export function Field({ label, style, containerStyle, onChangeText, onChange, secureTextEntry, keyboardType, multiline, error, hint, autoCapitalize, textContentType, placeholderTextColor, id, type, ...rest }: FieldProps) {
  const { c, fw } = useCz();
  const autoId = useId();
  const fid = id ?? autoId;
  void textContentType;
  void placeholderTextColor;
  const common = {
    id: fid,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? `${fid}-msg` : undefined,
    autoCapitalize: autoCapitalize === 'none' ? 'off' : autoCapitalize,
    className: 'cz-input',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange?.(e);
      onChangeText?.(e.target.value);
    },
    style: rn([
      {
        height: multiline ? undefined : 50,
        minHeight: multiline ? 96 : undefined,
        borderRadius: R.md,
        borderWidth: 1.5,
        borderColor: error ? B.red : c.line,
        backgroundColor: c.bg,
        color: c.ink,
        paddingHorizontal: 14,
        paddingVertical: multiline ? 12 : 0,
        ...fw(500),
        fontSize: 15,
        width: '100%',
      },
      style,
    ]),
  };
  return (
    <View style={[{ gap: 8 }, containerStyle]}>
      <Txt label as="label" htmlFor={fid}>
        {label}
      </Txt>
      {multiline ? (
        <textarea {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} {...common} />
      ) : (
        <input {...rest} {...common} type={secureTextEntry ? 'password' : (type ?? (keyboardType === 'email-address' ? 'email' : 'text'))} inputMode={keyboardType ? INPUT_MODE[keyboardType] : rest.inputMode} />
      )}
      {error || hint ? (
        <Txt id={`${fid}-msg`} size={12} color={error ? B.red : undefined} dim={!error}>
          {error || hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** Stat tile (label over value) on a soft surface. */
export function StatTile({ label, value, sub, color, big, style }: { label: string; value: string; sub?: string; color?: string; big?: boolean; style?: StyleProp }) {
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

export type ImageSource = string | { uri: string } | { src: string };

function srcOf(s: ImageSource): string {
  return typeof s === 'string' ? s : 'uri' in s ? s.uri : s.src;
}

/**
 * Photo with optional navy gradient scrim. `scrim` stops are [offset 0–1, alpha] pairs from top to
 * bottom.
 */
export function Photo({
  src,
  style,
  className,
  scrim,
  children,
  label,
  priority,
}: {
  src: ImageSource;
  style?: StyleProp;
  className?: string;
  scrim?: [number, number][];
  children?: React.ReactNode;
  /** Accessible description of the photo (omit when decorative) */
  label?: string;
  /** Eager-load (hero images) */
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const url = srcOf(src);
  const gradient = scrim ? `linear-gradient(to bottom, ${scrim.map(([o, a]) => `rgba(0,16,32,${a}) ${o * 100}%`).join(', ')})` : undefined;
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: B.photoBg }, style]} className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={url}
        src={url}
        alt={label ?? ''}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={{ ...rn(absoluteFill), width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 250ms ease' }}
      />
      {gradient ? <div aria-hidden style={{ ...rn(absoluteFill), backgroundImage: gradient, pointerEvents: 'none' }} /> : null}
      {children}
    </View>
  );
}

/** Info / advice strip on lime-soft (or warn on orange-soft). */
export function Note({ children, tone = 'lime', icon, style }: { children: React.ReactNode; tone?: 'lime' | 'warn' | 'danger' | 'navy'; icon?: string; style?: StyleProp }) {
  const { c } = useCz();
  const bg = tone === 'lime' ? c.limeSoft : tone === 'warn' ? 'rgba(255,126,0,0.16)' : tone === 'danger' ? B.deepRed : B.navy;
  const fg = tone === 'danger' || tone === 'navy' ? B.white : c.ink;
  const ic = tone === 'warn' ? B.orangeInk : tone === 'lime' ? c.leaf : fg;
  return (
    <View role={tone === 'danger' || tone === 'warn' ? 'alert' : undefined} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: bg }, style]}>
      {icon ? <Icon d={icon} size={18} color={ic} sw={2} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof children === 'string' ? (
          <Txt size={12.5} color={fg}>
            {children}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/* ───────────────────────────── Feedback ───────────────────────────── */

/** Spinner (RN ActivityIndicator). */
export function Spinner({ size = 'small', color, label }: { size?: 'small' | 'large' | number; color?: string; label?: string }) {
  const { c } = useCz();
  const t = useTranslations('common');
  const px = size === 'small' ? 20 : size === 'large' ? 36 : size;
  return (
    <span role="status" aria-label={label ?? t('loading')} className="cz-view" style={{ width: px, height: px, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg className="cz-spin" width={px} height={px} viewBox="0 0 24 24" aria-hidden focusable="false">
        <circle cx="12" cy="12" r="9.5" stroke={color ?? c.leaf} strokeOpacity={0.25} strokeWidth="3" fill="none" />
        <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke={color ?? c.leaf} strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}

/** Alias for ported code. */
export const ActivityIndicator = Spinner;

export type { CzStyle as ViewStyle };
