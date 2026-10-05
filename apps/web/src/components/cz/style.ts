/**
 * React Native style compatibility for porters. Every kit component takes `style` as a CzStyle,
 * an array of them (falsy entries skipped), exactly like RN's StyleProp. RN-only keys are mapped
 * to RTL-safe CSS logical properties:
 *
 *   paddingHorizontal → paddingInline        start / end      → insetInlineStart / insetInlineEnd
 *   paddingVertical   → paddingBlock         paddingStart/End → paddingInlineStart/End
 *   marginHorizontal  → marginInline         marginStart/End  → marginInlineStart/End
 *   borderTopStartRadius → borderStartStartRadius (etc.)
 *   lineHeight: 20    → '20px' (RN line heights are pixels, CSS unitless numbers are multipliers)
 *   transform: [{ scale: 0.98 }] → 'scale(0.98)'
 *   shadowColor/Opacity/Radius/Offset → boxShadow (elevation is ignored)
 *   borderWidth without borderStyle → borderStyle: 'solid'
 *
 * Use `rn(style)` to convert for a plain DOM element. `<View>` (ui.tsx) is a div with
 * react-native-web's View defaults (flex column, relative, no shrink, min-size 0).
 */
import type { CSSProperties } from 'react';

type Len = number | string;

type RNOnly = {
  paddingHorizontal?: Len;
  paddingVertical?: Len;
  marginHorizontal?: Len;
  marginVertical?: Len;
  paddingStart?: Len;
  paddingEnd?: Len;
  marginStart?: Len;
  marginEnd?: Len;
  start?: Len;
  end?: Len;
  borderStartWidth?: Len;
  borderEndWidth?: Len;
  borderStartColor?: string;
  borderEndColor?: string;
  borderTopStartRadius?: Len;
  borderTopEndRadius?: Len;
  borderBottomStartRadius?: Len;
  borderBottomEndRadius?: Len;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowRadius?: number;
  shadowOffset?: { width: number; height: number };
  elevation?: number;
  transform?: string | Array<Record<string, number | string>>;
  fontVariant?: string | string[];
  textAlignVertical?: string;
  includeFontPadding?: boolean;
  resizeMode?: string;
  tintColor?: string;
  writingDirection?: string;
};

export type CzStyle = Omit<CSSProperties, keyof RNOnly> & RNOnly;
export type StyleProp = CzStyle | null | undefined | false | 0 | '' | readonly StyleProp[];

const RENAME: Record<string, string> = {
  paddingHorizontal: 'paddingInline',
  paddingVertical: 'paddingBlock',
  marginHorizontal: 'marginInline',
  marginVertical: 'marginBlock',
  paddingStart: 'paddingInlineStart',
  paddingEnd: 'paddingInlineEnd',
  marginStart: 'marginInlineStart',
  marginEnd: 'marginInlineEnd',
  start: 'insetInlineStart',
  end: 'insetInlineEnd',
  borderStartWidth: 'borderInlineStartWidth',
  borderEndWidth: 'borderInlineEndWidth',
  borderStartColor: 'borderInlineStartColor',
  borderEndColor: 'borderInlineEndColor',
  borderTopStartRadius: 'borderStartStartRadius',
  borderTopEndRadius: 'borderStartEndRadius',
  borderBottomStartRadius: 'borderEndStartRadius',
  borderBottomEndRadius: 'borderEndEndRadius',
};

const DROP = new Set(['elevation', 'textAlignVertical', 'includeFontPadding', 'resizeMode', 'tintColor', 'writingDirection', 'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset']);
const BORDER_WIDTHS = ['borderWidth', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderStartWidth', 'borderEndWidth'];

/** Merge an RN-style StyleProp (nested arrays, falsy entries) into a single object. */
export function flatten(s: StyleProp): CzStyle {
  if (!s) return {};
  if (Array.isArray(s)) return (s as readonly StyleProp[]).reduce<CzStyle>((acc, x) => Object.assign(acc, flatten(x)), {});
  return s as CzStyle;
}

/** `#RRGGBB` / `#RGB` / `rgb()` / `rgba()` + opacity → `rgba(…)`. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
    return `rgba(${r},${g},${b},${Number(a) * alpha})`;
  }
  return c;
}

function transformToCss(t: RNOnly['transform']): string | undefined {
  if (t == null) return undefined;
  if (typeof t === 'string') return t;
  return t
    .map((o) =>
      Object.entries(o)
        .map(([k, v]) => {
          const unit = typeof v === 'number' && k.startsWith('translate') ? 'px' : '';
          return `${k}(${v}${unit})`;
        })
        .join(' '),
    )
    .join(' ');
}

/** Convert an RN-style StyleProp into a DOM CSSProperties object. */
export function rn(s: StyleProp): CSSProperties {
  const f = flatten(s) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || DROP.has(k)) continue;
    if (k === 'transform') out.transform = transformToCss(v as RNOnly['transform']);
    else if (k === 'fontVariant') out.fontVariantNumeric = Array.isArray(v) ? v.join(' ') : v;
    else if (k === 'lineHeight' && typeof v === 'number') out.lineHeight = `${v}px`;
    else out[RENAME[k] ?? k] = v;
  }
  if (f.shadowColor && typeof f.shadowColor === 'string' && out.boxShadow == null) {
    const o = (f.shadowOffset as RNOnly['shadowOffset']) ?? { width: 0, height: 0 };
    out.boxShadow = `${o.width}px ${o.height}px ${Number(f.shadowRadius ?? 0)}px ${withAlpha(f.shadowColor, Number(f.shadowOpacity ?? 1))}`;
  }
  if (out.borderStyle == null && BORDER_WIDTHS.some((k) => f[k] != null && f[k] !== 0)) out.borderStyle = 'solid';
  if (f.flexDirection != null && f.display == null) out.display = 'flex';
  return out as CSSProperties;
}

/** StyleSheet.absoluteFill equivalent. */
export const absoluteFill: CzStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

/** StyleSheet.hairlineWidth equivalent (CSS px). */
export const hairlineWidth = 0.5;
