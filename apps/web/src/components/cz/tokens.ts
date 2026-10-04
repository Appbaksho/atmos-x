/**
 * CoolZone design tokens: the Atmos X redesign. Port of apps/mobile/src/constants/cz.ts.
 * Brand: navy ink, lime action, electric blue accent.
 *
 * Two ways to use the theme palette:
 *  - `c` from useCz(): CSS-variable strings (`var(--cz-ink)`) that follow light/dark without a
 *    re-render; use these in style props and SVG fills.
 *  - `LIGHT` / `DARK` (raw hex) or `raw` from useCz(): for places that cannot read CSS variables
 *    (MapLibre styles, canvas, QR codes).
 * Tailwind classes exist for the same tokens: bg-bg, bg-card, bg-soft, text-ink, text-ink2,
 * border-line, text-leaf, bg-solid, text-on-solid, bg-lime-soft, text-accent, plus brand colours
 * bg-navy, bg-lime, text-lime-ink, bg-blue, … (see globals.css).
 */

export type RawPalette = {
  bg: string;
  card: string;
  soft: string;
  ink: string;
  ink2: string;
  line: string;
  /** Accent for links, rings and progress (blue in light, periwinkle in dark) */
  leaf: string;
  /** Solid emphasis surface (navy in light, lime in dark) */
  solid: string;
  onSolid: string;
  limeSoft: string;
  /** Selection colour: blue in light, lime in dark (radio dots, slider thumb, selected borders) */
  accent: string;
  dark: boolean;
};

/** Theme palette as used by components: CSS variables + the resolved `dark` flag. */
export type Palette = RawPalette;

export const LIGHT: RawPalette = {
  bg: '#F2F4F7',
  card: '#FFFFFF',
  soft: '#E6EAF0',
  ink: '#00182E',
  ink2: '#56657A',
  line: 'rgba(0,24,46,0.10)',
  leaf: '#013FF6',
  solid: '#00182E',
  onSolid: '#FFFFFF',
  limeSoft: '#EEF9CC',
  accent: '#013FF6',
  dark: false,
};

export const DARK: RawPalette = {
  bg: '#00182E',
  card: '#0B2742',
  soft: '#13334F',
  ink: '#EAF1F8',
  ink2: '#A3B2C4',
  line: 'rgba(234,241,230,0.12)',
  leaf: '#7C9CFF',
  solid: '#ACEC00',
  onSolid: '#00182E',
  limeSoft: 'rgba(172,236,0,0.16)',
  accent: '#ACEC00',
  dark: true,
};

/** CSS-variable palette (values defined in globals.css for :root/.light and .dark). */
export const VARS: Omit<RawPalette, 'dark'> = {
  bg: 'var(--cz-bg)',
  card: 'var(--cz-card)',
  soft: 'var(--cz-soft)',
  ink: 'var(--cz-ink)',
  ink2: 'var(--cz-ink2)',
  line: 'var(--cz-line)',
  leaf: 'var(--cz-leaf)',
  solid: 'var(--cz-solid)',
  onSolid: 'var(--cz-on-solid)',
  limeSoft: 'var(--cz-lime-soft)',
  accent: 'var(--cz-accent)',
};

/** Fixed brand colours, identical in both themes. */
export const B = {
  navy: '#00182E',
  navy2: '#0B2A4A',
  photoBg: '#0E2C48',
  photoBg2: '#163A5C',
  lime: '#ACEC00',
  limeHover: '#C0FF14',
  limeInk: '#131313',
  blue: '#013FF6',
  white: '#FFFFFF',
  red: '#E5533D',
  deepRed: '#A3242B',
  orange: '#F29A38',
  orangeInk: '#C26A10',
  yellow: '#F2D04B',
  green: '#4CAF50',
  /** Scrim / overlay ink */
  scrim: 'rgba(0,16,32,0.45)',
  glass: 'rgba(255,255,255,0.18)',
  glassLine: 'rgba(255,255,255,0.30)',
  glassDark: 'rgba(0,24,46,0.45)',
} as const;

/** Heat Score (0–100) → colour band. */
export function heatColor(s: number): string {
  return s < 40 ? B.green : s < 55 ? B.yellow : s < 70 ? B.orange : s < 85 ? B.red : B.deepRed;
}
/** Readable text colour on top of heatColor(s). */
export function heatFg(s: number): string {
  return s < 70 ? B.navy : B.white;
}

/** US EPA PM2.5 AQI bands (index = band 0–5, same order as AqiCategory). */
export const AQI_COLORS = ['#00E400', '#FFFF00', '#FF7E00', '#FF0000', '#8F3F97', '#7E0023'] as const;
export const AQI_FG = [B.navy, B.navy, B.navy, B.white, B.white, B.white] as const;
export const AQI_CATEGORIES = ['good', 'moderate', 'usg', 'unhealthy', 'very_unhealthy', 'hazardous'] as const;

/** US EPA 2024 PM2.5 band index 0–5. */
export function pmBand(pm: number): number {
  return pm <= 9 ? 0 : pm <= 35.4 ? 1 : pm <= 55.4 ? 2 : pm <= 125.4 ? 3 : pm <= 225.4 ? 4 : 5;
}
/** PM2.5 (µg/m³) → AQI. Display only; the server computes the canonical value. */
export function pmAqi(pm: number): number {
  const T = [
    [0, 9, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 500, 301, 500],
  ];
  const b = T.find((x) => pm <= x[1]) ?? T[5];
  return Math.round(b[2] + ((pm - b[0]) / (b[1] - b[0])) * (b[3] - b[2]));
}
/** Colour pair for an AqiCategory string. */
export function aqiColors(category: (typeof AQI_CATEGORIES)[number]): { bg: string; fg: string } {
  const i = Math.max(0, AQI_CATEGORIES.indexOf(category));
  return { bg: AQI_COLORS[i], fg: AQI_FG[i] };
}

export type HeatRiskKey = 'ok' | 'caution' | 'xcaution' | 'danger' | 'xdanger';

/** NOAA heat-index risk band colours (from apps/mobile/src/lib/cz/live.ts). */
export const HEAT_RISK: Record<HeatRiskKey, { color: string; fg: string }> = {
  xdanger: { color: '#A3242B', fg: '#FFFFFF' },
  danger: { color: '#E5533D', fg: '#FFFFFF' },
  xcaution: { color: '#F29A38', fg: '#00182E' },
  caution: { color: '#F2D04B', fg: '#00182E' },
  ok: { color: '#4CAF50', fg: '#00182E' },
};

/** NOAA heat-index risk band for a feels-like temperature (°C). Prefer `conditions.heat_risk` from the server. */
export function heatRisk(feelsC: number): { key: HeatRiskKey; color: string; fg: string } {
  const key: HeatRiskKey = feelsC >= 54 ? 'xdanger' : feelsC >= 41 ? 'danger' : feelsC >= 32 ? 'xcaution' : feelsC >= 27 ? 'caution' : 'ok';
  return { key, ...HEAT_RISK[key] };
}

/** Avatar colour pairs used for initials. */
export const AVATARS: [string, string][] = [
  [B.lime, B.limeInk],
  [B.blue, B.white],
  [B.orange, B.navy],
  [B.navy, B.white],
  [B.green, B.navy],
  [B.red, B.white],
];

/** Radii (px). Tailwind: rounded-cz-sm … rounded-cz-xxl. */
export const R = { sm: 12, md: 16, lg: 20, xl: 24, xxl: 28, pill: 999 } as const;
/** Spacing scale (px). */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** Space reserved under content on tab screens (floating tab bar + gap). Desktop uses less (sidebar). */
export const TAB_CLEARANCE = 116;
/** Space reserved under content on stacked screens (room for the Ask Atmos button). */
export const STACK_CLEARANCE = 96;

/**
 * Shadow presets as CSS box-shadow strings (same numbers react-native-web renders for the Expo
 * reference). Tailwind: shadow-cz-card, shadow-cz-button, shadow-cz-fab, shadow-cz-sheet.
 */
export const SHADOW = {
  card: { boxShadow: '0px 10px 15px rgba(0,24,46,0.16)' },
  button: { boxShadow: '5px 5px 5px rgba(0,0,0,0.12)' },
  fab: { boxShadow: '0px 10px 12px rgba(0,24,46,0.4)' },
  sheet: { boxShadow: '0px -10px 15px rgba(0,16,32,0.25)' },
} as const;

/** CSS font stacks (variables are switched per locale in globals.css). */
export const FONT = {
  body: 'var(--cz-font-body)',
  display: 'var(--cz-font-display)',
} as const;

export type Weight = 400 | 500 | 600 | 700;
