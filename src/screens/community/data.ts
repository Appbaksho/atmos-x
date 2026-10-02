/**
 * Community (S16–S19) copy + demo data, ported from the prototype's `CzCom.dc.html` (`T`, boards,
 * tasks, members, org goals, QR generator). Read the copy with `f.pick(T)`; bn/ur fall back to English
 * per key where the prototype has no translation.
 */
import { Platform } from 'react-native';

import { AVATARS } from '@/constants/cz';
import { initials } from '@/lib/cz/format';

export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

type Dict = {
  hub: string;
  hubSub: string;
  myClans: string;
  boards: string;
  who: string[];
  scopes: string[];
  rising: string;
  thisWeek: string;
  invite: string;
  ofGoal: string;
  headline: string;
  evidence: string;
  cols: string[];
  verifiedOrg: string;
  orgSub: string;
  goalsZones: string;
  contribMap: string;
  newTeam: string;
  teamName: string;
  size: string;
  sizeNote: string;
  inviteBy: string;
  inv: string[];
  copy: string;
  copied: string;
  expires: string;
  create: string;
  /* Copy the prototype keeps in English inline — kept here so screens stay string-free. */
  you: string;
  yourTeam: string;
  yourOrg: string;
  newTeamA11y: string;
  teamMeta: (n: string) => string;
  orgMeta: (n: string) => string;
  teamSub: (n: string) => string;
  goalOf: (d: string) => string;
  goalLine: (d: string) => string;
  agrees: string;
  noisy: string;
  orgStats: string[];
  placeholder: string;
  warnSmall: (h: string) => string;
  warnBig: string;
  qrA11y: string;
  codeA11y: string;
  linkA11y: string;
  points: string;
  up: (n: string) => string;
};

export const T: { en: Dict } & Partial<Record<'bn' | 'ur', Partial<Dict>>> = {
  en: {
    hub: 'Community', hubSub: 'Mohammadpur · Dhaka', myClans: 'My clans', boards: 'Leaderboards', who: ['People', 'Teams', 'Orgs'], scopes: ['Area', 'City', 'Country'],
    rising: 'Rising board', thisWeek: 'this week', invite: 'Invite', ofGoal: 'of goal', headline: 'Modeled cooling', evidence: 'Evidence', cols: ['To do', 'Doing', 'Done'],
    verifiedOrg: 'Verified organization', orgSub: 'University of Dhaka · since 2025', goalsZones: 'Goals across zones', contribMap: 'Contribution map',
    newTeam: 'New team', teamName: 'Team name', size: 'Team size', sizeNote: 'Suggested 6–8 from feasibility', inviteBy: 'Invite by', inv: ['Link', 'QR', 'Code'],
    copy: 'Copy', copied: 'Copied', expires: 'Links and codes expire in 7 days · 9 Oct', create: 'Create team',
    you: '(you)', yourTeam: '(your team)', yourOrg: '(your org)', newTeamA11y: 'New team',
    teamMeta: (n) => `${n} members · team`,
    orgMeta: (n) => `${n} teams · verified`,
    teamSub: (n) => `Asad Gate block · ${n} members`,
    goalOf: (d) => `of ${d} by Oct 2027`,
    goalLine: (d) => `Asad Gate block · ${d} by Oct 2027`,
    agrees: 'Agrees', noisy: 'Noisy',
    orgStats: ['Area rank', 'Teams', 'Zones', 'Points'],
    placeholder: 'e.g. Asad Gate Shade Crew',
    warnSmall: (h) => `Smaller than suggested — expect ≈ ${h} h a week each.`,
    warnBig: 'Bigger than needed — great for watering rotas, slower to coordinate.',
    qrA11y: 'QR code for the invite link', codeA11y: 'Invite code', linkA11y: 'Invite link',
    points: 'points', up: (n) => `up ${n} places`,
  },
  bn: {
    hub: 'কমিউনিটি', myClans: 'আমার দল', boards: 'লিডারবোর্ড', who: ['ব্যক্তি', 'দল', 'সংগঠন'], scopes: ['এলাকা', 'শহর', 'দেশ'], invite: 'আমন্ত্রণ', cols: ['করণীয়', 'চলছে', 'সম্পন্ন'],
    newTeam: 'নতুন দল', teamName: 'দলের নাম', size: 'দলের আকার', inviteBy: 'আমন্ত্রণ', inv: ['লিংক', 'QR', 'কোড'], copy: 'কপি', copied: 'কপি হয়েছে', create: 'দল তৈরি করুন', evidence: 'প্রমাণ',
    you: '(আপনি)', yourTeam: '(আপনার দল)', yourOrg: '(আপনার সংগঠন)',
  },
  ur: {
    hub: 'کمیونٹی', myClans: 'میرے گروپ', boards: 'لیڈر بورڈ', who: ['افراد', 'ٹیمیں', 'ادارے'], scopes: ['علاقہ', 'شہر', 'ملک'], invite: 'دعوت', cols: ['کرنا ہے', 'جاری', 'مکمل'],
    newTeam: 'نئی ٹیم', teamName: 'ٹیم کا نام', size: 'ٹیم کا سائز', inviteBy: 'دعوت بذریعہ', inv: ['لنک', 'QR', 'کوڈ'], copy: 'کاپی', copied: 'کاپی ہو گیا', create: 'ٹیم بنائیں', evidence: 'ثبوت',
    you: '(آپ)', yourTeam: '(آپ کی ٹیم)', yourOrg: '(آپ کا ادارہ)',
  },
};

/* ───────────── S16 · leaderboards ───────────── */

type Board = { top: [string, number][]; me: [string, number]; rank: [number, number, number] };

/** People / Teams / Orgs boards. `me` is the user's own row; `rank` is their rank per scope. */
export const BOARDS: Board[] = [
  { top: [['Rafi Ahmed', 3980], ['Tania Sultana', 3410], ['Imran Hossain', 2960], ['Mitu Khatun', 2710]], me: ['Nadia Rahman', 2340], rank: [9, 142, 1204] },
  { top: [['Green Mohammadpur', 21400], ['Ring Road Shade Squad', 18900], ['Geneva Camp Gardeners', 15200], ['Lalmatia Roof Club', 12800]], me: ['Hall Rooftop Crew', 9820], rank: [9, 61, 488] },
  { top: [['BRAC University Eco Club', 64200], ['DNCC Ward 33', 51800], ['Bidyanondo Green', 44100], ['Shishu Park Friends', 30900]], me: ['DU Green Society', 18420], rank: [7, 23, 96] },
];

/** Area / City / Country points multiplier for the top rows. */
export const SCOPE_MUL = [1, 2.6, 7.4];

export const RISING: [string, number, string][] = [
  ['Hall Rooftop Crew', 5, '3 Neem verified · 1,200 m² roof booked'],
  ['Geneva Camp Gardeners', 4, '40 climbers planted'],
  ['Lalmatia Roof Club', 3, 'First satellite check passed'],
];

/** The team's progress toward its goal (%). */
export const TEAM_PCT = 38;
export const TEAM_SIZE = 6;
export const ORG_TEAMS = 4;

/* ───────────── S17 · team dashboard ───────────── */

export const EVIDENCE: { src: string; what: (d: (c: number) => string) => string; agrees: boolean }[] = [
  { src: 'Satellite · Landsat 9 LST', what: (d) => 'Roof surface ' + d(-1.8) + ' vs Sep 2025', agrees: true },
  { src: 'Ground · 2 sensors', what: (d) => 'Air ' + d(-0.3) + ' · short record', agrees: false },
];

/** Task columns: [title, due, assignee initials]. */
export const TASKS: [string, string, string][][] = [
  [['Coat 120 m² of hostel roof', 'Sat 5 Oct', 'NR'], ['Buy 12 tree guards', 'Mon 7 Oct', 'RA'], ['Ask hall office for roof key', 'This week', 'TS']],
  [['Book coating supplier', 'In progress · 2 quotes', 'IH'], ['Water the 3 Neem', 'Twice a week', 'MK']],
  [['Plant 3 Neem at Asad Gate', 'Done 2 Oct · verified', 'NR'], ['Survey roofs', 'Done 21 Sep', 'RA'], ['Set goal', 'Done 18 Sep', 'NR']],
];
/** Column counts shown on the segmented control (the board shows the latest few). */
export const TASK_COUNTS = [3, 2, 7];

export const MEMBERS: [string, string, number][] = [
  ['Nadia Rahman', 'Lead · you', 2340],
  ['Rafi Ahmed', 'Roofs', 3980],
  ['Tania Sultana', 'Trees', 1820],
  ['Imran Hossain', 'Supplies', 1410],
  ['Mitu Khatun', 'Watering', 980],
  ['Sabbir Biswas', 'New', 120],
];

/** Avatar colours for a member's initials (member order). */
export function avatarOf(ini: string): [string, string] {
  const m = MEMBERS.findIndex((x) => initials(x[0]) === ini);
  return AVATARS[Math.max(0, m) % 6];
}

/* ───────────── S18 · organization ───────────── */

export const ORG_HERO = 'https://images.unsplash.com/photo-1628983065463-d59659ef4f18?auto=format&fit=crop&w=900&h=720&q=70';
export const ORG_MAP = 'https://images.unsplash.com/photo-1592396131156-0d1a9c1f6869?auto=format&fit=crop&w=800&h=400&q=70';

/** Stat tile values (label from `T.orgStats`). */
export const ORG_STATS = ['#7', '4', '3', '18.4k'];

/** [zone, goal delta °C, deadline, progress %] */
export const ORG_GOALS: [string, number, string, number][] = [
  ['Asad Gate block', -1.5, 'Oct 2027', 38],
  ['Nilkhet crossing', -1.0, 'Jun 2027', 61],
  ['Curzon Hall lawn edge', -0.5, 'Dec 2026', 90],
];

/** Contribution dots on a 346×180 map: [x, y, r]. */
export const ORG_DOTS: [number, number, number][] = [[90, 60, 9], [150, 110, 12], [230, 70, 7], [270, 130, 10], [120, 140, 6]];

/** [name, meta, points, opens team dashboard] */
export const ORG_TEAM_LIST: [string, string, number, boolean][] = [
  ['Hall Rooftop Crew', 'Asad Gate block · 6 members', 9820, true],
  ['Nilkhet Shade Team', 'Nilkhet crossing · 9 members', 5110, false],
  ['Curzon Lawn Keepers', 'Curzon Hall · 4 members', 2640, false],
  ['Fuller Road Climbers', 'Nilkhet crossing · 5 members', 850, false],
];

/* ───────────── S19 · create & invite ───────────── */

export const INVITE_URL = 'https://atmosx.app/j/hrc-4K7Q';
export const INVITE_SHORT = 'atmosx.app/j/hrc-4K7Q';
export const INVITE_CODE = '4K7Q-29';

/** The prototype's decorative 25×25 QR: seeded modules plus the three finder patterns. */
export const QR_N = 25;
export const QR: { x: number; y: number }[] = (() => {
  const N = QR_N;
  const corners = [[0, 0], [N - 7, 0], [0, N - 7]];
  const fin = (x: number, y: number) => corners.some(([a, b]) => x >= a && x < a + 7 && y >= b && y < b + 7);
  const finOn = (x: number, y: number) => {
    for (const [a, b] of corners) {
      const dx = x - a;
      const dy = y - b;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
    }
    return false;
  };
  let seed = 4271;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const on = fin(x, y) ? finOn(x, y) : x === 7 || y === 7 || (x === N - 8 && y < 8) || (y === N - 8 && x < 8) ? false : rnd() > 0.52;
      if (on) out.push({ x, y });
    }
  }
  return out;
})();
