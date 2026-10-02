/**
 * CoolZone design tokens — the Atmos X redesign.
 * Source of truth: "CoolZone Prototype" (claude.ai/design). Brand: navy ink, lime action, electric blue accent.
 */

export type Palette = {
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
  dark: boolean;
};

export const LIGHT: Palette = {
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
  dark: false,
};

export const DARK: Palette = {
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
  dark: true,
};

/** Fixed brand colours — identical in both themes. */
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

/** US EPA PM2.5 AQI bands. */
export const AQI_COLORS = ['#00E400', '#FFFF00', '#FF7E00', '#FF0000', '#8F3F97', '#7E0023'] as const;
export const AQI_FG = [B.navy, B.navy, B.navy, B.white, B.white, B.white] as const;
export function pmBand(pm: number): number {
  return pm <= 9 ? 0 : pm <= 35.4 ? 1 : pm <= 55.4 ? 2 : pm <= 125.4 ? 3 : pm <= 225.4 ? 4 : 5;
}
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

/** Avatar colour pairs used for initials. */
export const AVATARS: [string, string][] = [
  [B.lime, B.limeInk],
  [B.blue, B.white],
  [B.orange, B.navy],
  [B.navy, B.white],
  [B.green, B.navy],
  [B.red, B.white],
];

export const R = { sm: 12, md: 16, lg: 20, xl: 24, xxl: 28, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

/** Height reserved under scroll content on tab screens (floating tab bar + gap). */
export const TAB_CLEARANCE = 116;
/** Height reserved under scroll content on stacked screens (room for the Ask Atmos button). */
export const STACK_CLEARANCE = 96;

/** Shadow presets (iOS shadow* + Android elevation). */
export const SHADOW = {
  card: { shadowColor: '#00182E', shadowOpacity: 0.16, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  button: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 5, height: 5 }, elevation: 3 },
  fab: { shadowColor: '#00182E', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  sheet: { shadowColor: '#001020', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: -10 }, elevation: 16 },
} as const;

/** Font families (loaded in the root layout). */
export const FONT = {
  display: 'LemonMilk',
  latin: { 400: 'Poppins_400Regular', 500: 'Poppins_500Medium', 600: 'Poppins_600SemiBold', 700: 'Poppins_700Bold' },
  bn: { 400: 'NotoSansBengali_400Regular', 500: 'NotoSansBengali_500Medium', 600: 'NotoSansBengali_600SemiBold', 700: 'NotoSansBengali_600SemiBold' },
  ur: { 400: 'NotoNastaliqUrdu_400Regular', 500: 'NotoNastaliqUrdu_400Regular', 600: 'NotoNastaliqUrdu_600SemiBold', 700: 'NotoNastaliqUrdu_600SemiBold' },
} as const;

export type Weight = 400 | 500 | 600 | 700;
