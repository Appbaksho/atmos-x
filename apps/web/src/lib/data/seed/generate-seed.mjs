// Generates story.json + community.json next to this file (deterministic). Run: node src/lib/data/seed/generate-seed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PTS = { plant_tree: 50, plant_shrubs: 12, rooftop_garden: 40, cool_roof: 30, green_wall: 20, shade_structure: 25, water_tree: 5, awareness: 30 };
const COOL = { plant_tree: 0.0006, plant_shrubs: 0.0001, rooftop_garden: 0.0003, cool_roof: 0.0004, green_wall: 0.00015, shade_structure: 0.0002, water_tree: 0, awareness: 0 };

let seed = 4271;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const r6 = (x) => +x.toFixed(6);

const SAPLING = 'https://images.unsplash.com/photo-1683994857980-280afa59a3f8?auto=format&fit=crop&w=900&h=1200&q=70';
const HRC = 'hall-rooftop-crew';
const DU = 'du-green-society';
const GOAL = 'g-asad-gate';
const ASAD = { lat: 23.7604, lng: 90.36 };
const HOME = { lat: 23.759, lng: 90.359 };

/* ───────────── Nadia's story (dates are days_ago when the demo is loaded) ───────────── */
const A = (id, days_ago, action_type, quantity, opts = {}) => ({
  id, days_ago, action_type, quantity, status: opts.status ?? 'verified', team_id: opts.team ? HRC : null, goal_id: opts.goal ? GOAL : null,
  zone_label: opts.zone ?? 'Asad Gate block', note: opts.note ?? null, photo_url: opts.photo === false ? null : SAPLING,
  lat: opts.loc?.lat ?? ASAD.lat, lng: opts.loc?.lng ?? ASAD.lng,
  verification: opts.status === 'pending'
    ? { status: 'pending', confidence: 0.48, seen: 'A shade frame, partly built', reason_code: 'low_confidence' }
    : { status: 'verified', confidence: 0.9, seen: opts.seen ?? 'Matches the logged action', reason_code: 'ok' },
});
const COURTYARD = { lat: 23.7612, lng: 90.3611 };
const actions = [
  A('a-0001', 3, 'plant_tree', 3, { team: true, goal: true, note: '3 Neem at Asad Gate', seen: 'Three young neem saplings with tree guards' }),
  A('a-0002', 10, 'cool_roof', 12, { team: true, goal: true, note: '120 m² of hostel roof coated white', seen: 'A freshly whitewashed concrete roof' }),
  A('a-0003', 31, 'rooftop_garden', 20, { team: true, note: 'Hall roof garden beds', seen: 'Raised planter beds on a roof' }),
  A('a-0004', 20, 'shade_structure', 4, { team: true, note: 'Shade cloth over the hall gate', seen: 'Green shade cloth stretched over a gate' }),
  A('a-0005', 40, 'green_wall', 10, { zone: 'Hostel courtyard', loc: COURTYARD, note: 'Creepers on the west wall' }),
  A('a-0006', 48, 'plant_tree', 1, { zone: 'Hostel courtyard', loc: COURTYARD, note: 'Jarul in the courtyard', seen: 'A young jarul sapling' }),
  A('a-0007', 55, 'plant_shrubs', 10, { zone: 'Hostel courtyard', loc: COURTYARD, note: 'Balcony pots' }),
  A('a-0008', 45, 'awareness', 2, { photo: false, note: 'Heat safety talk at the hall' }),
  A('a-0009', 25, 'awareness', 2, { team: true, photo: false, note: 'Roof survey with neighbours' }),
  A('a-0010', 6, 'awareness', 2, { team: true, photo: false, note: 'School talk, Mohammadpur' }),
  A('a-0011', 2, 'water_tree', 10, { team: true, photo: false, note: 'Watered the 3 neem' }),
  A('a-0012', 9, 'water_tree', 10, { team: true, photo: false }),
  A('a-0013', 16, 'water_tree', 10, { team: true, photo: false }),
  A('a-0014', 23, 'water_tree', 8, { team: true, photo: false }),
  A('a-0015', 60, 'awareness', 6, { photo: false, note: 'Ward meeting series' }),
  A('a-0016', 1, 'shade_structure', 1, { team: true, goal: true, status: 'pending', note: 'Bus-stop canopy (half built)' }),
].map((a) => ({ ...a, points: PTS[a.action_type] * a.quantity, cooling_c: r6(COOL[a.action_type] * a.quantity), trees: a.action_type === 'plant_tree' ? a.quantity : 0 }));

const verified = actions.filter((a) => a.status === 'verified');
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const CHECK_POINTS = 10; // 2 tree photo checks × 5 points (see `checks` below)
const total = sum(verified, (a) => a.points) + CHECK_POINTS;
if (total !== 2340) throw new Error('Nadia should have 2340 points (actions + checks), got ' + total);
const inPeriod = (a, p) => (p === 'week' ? a.days_ago < 7 : p === 'month' ? a.days_ago < 30 : true);
const nadiaTeam = (p) => sum(verified.filter((a) => a.team_id === HRC && inPeriod(a, p)), (a) => a.points);
const nadiaAll = (p) => sum(verified.filter((a) => inPeriod(a, p)), (a) => a.points);

const trees = [
  { id: 'ATX-26-0001', species_id: 'neem', nickname: 'Shanti', planted_days_ago: 3, last_check_days_ago: null, location: { lat: 23.76045, lng: 90.35985 }, health: 'healthy', photo_url: SAPLING },
  { id: 'ATX-26-0002', species_id: 'neem', nickname: 'Megh', planted_days_ago: 3, last_check_days_ago: null, location: { lat: 23.76052, lng: 90.36003 }, health: 'healthy', photo_url: SAPLING },
  { id: 'ATX-26-0003', species_id: 'neem', nickname: 'Chhaya', planted_days_ago: 3, last_check_days_ago: null, location: { lat: 23.7606, lng: 90.36021 }, health: 'healthy', photo_url: SAPLING },
  // 48 days old, last photo 14 days ago → next photo due tomorrow (status "due")
  { id: 'ATX-26-0005', species_id: 'jarul', nickname: 'Beguni', planted_days_ago: 48, last_check_days_ago: 14, location: COURTYARD, health: 'healthy', photo_url: SAPLING },
];
const checks = [
  { id: 'c-0001', tree_id: 'ATX-26-0005', days_ago: 33, health: 'healthy', note: null, photo_url: SAPLING, points: 5 },
  { id: 'c-0002', tree_id: 'ATX-26-0005', days_ago: 14, health: 'healthy', note: 'New leaves after the rain', photo_url: SAPLING, points: 5 },
];

const story = {
  _note: 'Nadia Rahman\'s Presentation-mode story (ported from apps/mobile/src/lib/cz/demo.ts). *_days_ago are relative to the moment the demo namespace is loaded, so "1 tree due" stays true on presentation day.',
  user: { id: 'u-nadia', display_name: 'Nadia Rahman', email: 'nadia.demo@atmosx.app', first_name: { en: 'Nadia', bn: 'নাদিয়া', ur: 'نادیہ' } },
  profile: { home: HOME, radius_m: 500 },
  goal: {
    id: GOAL, zone_id: 'demo:asad-gate', zone_name: 'Asad Gate block', zone_centroid: ASAD, zone_area_km2: 0.12,
    target_c: -1.5, by_date: '2027-10-02', progress_pct: 38, modeled_c: -0.57, team_id: HRC, org_id: DU, created_days_ago: 17,
  },
  trees,
  checks,
  actions,
  memberships: [{ team_id: HRC, role: 'owner', joined_days_ago: 21 }],
  fields: [{ id: 'f-north-plot', name: 'North plot', crop: 'boro', stage: 'flowering', location: { lat: 23.7712, lng: 90.342 }, area: 1.2, created_days_ago: 40 }],
  sensors: [{ id: 's-balcony-node', name: 'Balcony node', model: 'Sensor.Community kit (simulated)', location: { lat: 23.75915, lng: 90.35912 }, created_days_ago: 12 }],
  notifications: [
    { id: 'n-0001', kind: 'verification', title: { code: 'notif.verification.verified', params: { action: 'plant_tree', qty: 3, points: 150 } }, body: { code: 'notif.verification.verified_body', params: { seen: 'Three young neem saplings with tree guards' } }, screen: 'S15', params: { id: 'a-0001' }, read: false, days_ago: 3 },
    { id: 'n-0002', kind: 'goal_progress', title: { code: 'notif.goal.milestone', params: { pct: 25, zone: 'Asad Gate block' } }, body: null, screen: 'S10', params: { goal_id: GOAL }, read: true, days_ago: 9 },
    { id: 'n-0003', kind: 'verification', title: { code: 'notif.verification.pending', params: { action: 'shade_structure', qty: 1, points: 25 } }, body: { code: 'notif.verification.pending_body' }, screen: 'S15', params: { id: 'a-0016' }, read: false, days_ago: 1 },
  ],
};

/* ───────────── Community ───────────── */
const PERIODS = ['week', 'month', 'all'];
const SCOPES = ['area', 'city', 'country'];
const split = (all, wf = 0.05 + rnd() * 0.06, mf = 0.2 + rnd() * 0.12) => ({ week: Math.round(all * wf), month: Math.round(all * mf), all });
const treesOf = (p) => Math.round(p / 95);
const coolOf = (p) => r6((p / 95) * 0.0006 + (p / 400) * 0.0004);

// People (area) – BOARDS[0] of community/data.ts plus neighbours so Nadia (2340) ranks 9.
const AREA_PEOPLE = [
  ['u-rafi', 'Rafi Ahmed', 3980], ['u-tania', 'Tania Sultana', 3410], ['u-imran', 'Imran Hossain', 2960], ['u-mitu', 'Mitu Khatun', 2710],
  ['u-sumaiya', 'Sumaiya Akter', 2620], ['u-arif', 'Arif Chowdhury', 2555], ['u-farhana', 'Farhana Yasmin', 2480], ['u-jahid', 'Jahid Hasan', 2395],
  ['u-sadia', 'Sadia Islam', 2210], ['u-tanvir', 'Tanvir Alam', 1990], ['u-nusrat', 'Nusrat Jahan', 1760], ['u-kamal', 'Kamal Uddin', 1420],
  ['u-rumana', 'Rumana Begum', 980], ['u-sabbir', 'Sabbir Biswas', 120],
];
const CITY_PEOPLE = [
  ['u-mahbub', 'Mahbub Alam', 11800], ['u-shirin', 'Shirin Akhter', 10450], ['u-zahid', 'Zahid Karim', 9620], ['u-lubna', 'Lubna Haque', 8890],
  ['u-ashraf', 'Ashraful Islam', 8200], ['u-joya', 'Joya Das', 7740], ['u-rezaul', 'Rezaul Karim', 7310], ['u-moumita', 'Moumita Roy', 6950],
];
const COUNTRY_PEOPLE = [
  ['u-habib', 'Habibur Rahman', 31200], ['u-parvin', 'Parvin Sultana', 28700], ['u-anwar', 'Anwar Hossain', 25100], ['u-rokeya', 'Rokeya Khatun', 23400],
  ['u-shafiq', 'Shafiqul Islam', 21800], ['u-nasrin', 'Nasrin Akter', 19900], ['u-kabir', 'Kabir Ahmed', 18300], ['u-moni', 'Moni Chakma', 17100],
];
const AREA_TEAMS = [
  ['green-mohammadpur', 'Green Mohammadpur', 21400, '🌳'], ['ring-road-shade-squad', 'Ring Road Shade Squad', 18900, '⛱️'],
  ['geneva-camp-gardeners', 'Geneva Camp Gardeners', 15200, '🪴'], ['lalmatia-roof-club', 'Lalmatia Roof Club', 12800, '🏡'],
  ['housing-greeners', 'Mohammadpur Housing Greeners', 11900, '🌿'], ['shyamoli-shade', 'Shyamoli Shade Collective', 11250, '🌲'],
  ['tajmahal-tree-team', 'Tajmahal Road Tree Team', 10700, '🌳'], ['town-hall-traders', 'Town Hall Market Traders', 10100, '🏪'],
  [HRC, 'Hall Rooftop Crew', 9820, '🏠'], ['iqbal-road-gardeners', 'Iqbal Road Gardeners', 7400, '🌱'], ['kaderabad-kids', 'Kaderabad Kids Club', 5200, '🎒'],
];
const CITY_TEAMS = [
  ['dhanmondi-lake-keepers', 'Dhanmondi Lake Keepers', 48200, '💧'], ['uttara-sector-7', 'Uttara Sector 7 Greens', 41900, '🌳'],
  ['mirpur-roof-rebels', 'Mirpur Roof Rebels', 36500, '⬜'], ['old-dhaka-shade', 'Old Dhaka Shade Makers', 31800, '⛱️'],
  ['gulshan-canopy', 'Gulshan Canopy Club', 27400, '🌲'], ['nilkhet-shade-team', 'Nilkhet Shade Team', 5110, '🌿'],
  ['curzon-lawn-keepers', 'Curzon Lawn Keepers', 2640, '🌱'], ['fuller-road-climbers', 'Fuller Road Climbers', 850, '🌿'],
];
const COUNTRY_TEAMS = [
  ['ctg-hill-greeners', 'Chattogram Hill Greeners', 96400, '⛰️'], ['khulna-mangrove-friends', 'Khulna Mangrove Friends', 88100, '🌴'],
  ['rajshahi-mango-shade', 'Rajshahi Mango Shade', 74300, '🥭'], ['sylhet-tea-garden-youth', 'Sylhet Tea Garden Youth', 69900, '🍃'],
];
const AREA_ORGS = [
  ['brac-eco-club', 'BRAC University Eco Club', 64200, 'school'], ['dncc-ward-33', 'DNCC Ward 33', 51800, 'city'], ['bidyanondo-green', 'Bidyanondo Green', 44100, 'ngo'],
  ['shishu-park-friends', 'Shishu Park Friends', 30900, 'ngo'], ['mohammadpur-youth-forum', 'Mohammadpur Youth Forum', 26000, 'ngo'],
  ['lalmatia-welfare', 'Lalmatia Residents Welfare', 21000, 'other'], [DU, 'DU Green Society', 18420, 'school'], ['dhaka-green-schools', 'Dhaka Green Schools', 9000, 'school'],
];
const CITY_ORGS = [['dncc', 'Dhaka North City Corporation', 212000, 'city'], ['dscc', 'Dhaka South City Corporation', 188000, 'city'], ['buet-green', 'BUET Green Club', 97000, 'school']];
const COUNTRY_ORGS = [['bd-forest-youth', 'Bangladesh Forest Youth', 640000, 'ngo'], ['cleanchattogram', 'Clean Chattogram', 402000, 'ngo']];

// Period points per entity (same entity = same numbers in every scope)
const ENT = new Map();
const addEnt = ([id, name, all, emoji]) => ENT.set(id, { id, name, emoji: emoji ?? undefined, pts: split(all) });
[...AREA_PEOPLE, ...CITY_PEOPLE, ...COUNTRY_PEOPLE, ...AREA_TEAMS, ...CITY_TEAMS, ...COUNTRY_TEAMS].forEach(addEnt);
[...AREA_ORGS, ...CITY_ORGS, ...COUNTRY_ORGS].forEach(([id, name, all, kind]) => addEnt([id, name, all, kind === 'school' ? '🎓' : kind === 'city' ? '🏛️' : '🤝']));

// Hall Rooftop Crew: "up 5 places this week" → a strong week. Seed rows hold the BASE (without Nadia's
// contributions, which are added live from her story / the local store).
ENT.get(HRC).pts = { week: 1180, month: 3400, all: 9820 };
const hrcFull = { ...ENT.get(HRC).pts };
const hrcBase = Object.fromEntries(PERIODS.map((p) => [p, hrcFull[p] - nadiaTeam(p)]));
ENT.get(HRC).pts = hrcBase;
const duFull = { week: 1900, month: 5600, all: 18420 };
ENT.get(DU).pts = Object.fromEntries(PERIODS.map((p) => [p, duFull[p] - nadiaTeam(p)]));

const row = (id, p) => {
  const e = ENT.get(id);
  const points = e.pts[p];
  return { id, name: e.name, ...(e.emoji ? { emoji: e.emoji } : {}), points, trees: treesOf(points), cooling_c: coolOf(points) };
};
const ids = (xs) => xs.map((x) => x[0]);
const pop = {
  user: { area: ids(AREA_PEOPLE), city: [...ids(AREA_PEOPLE), ...ids(CITY_PEOPLE)], country: [...ids(AREA_PEOPLE), ...ids(CITY_PEOPLE), ...ids(COUNTRY_PEOPLE)] },
  team: { area: ids(AREA_TEAMS), city: [...ids(AREA_TEAMS), ...ids(CITY_TEAMS)], country: [...ids(AREA_TEAMS), ...ids(CITY_TEAMS), ...ids(COUNTRY_TEAMS)] },
  org: { area: ids(AREA_ORGS), city: [...ids(AREA_ORGS), ...ids(CITY_ORGS)], country: [...ids(AREA_ORGS), ...ids(CITY_ORGS), ...ids(COUNTRY_ORGS)] },
};
// Rank of the prototype's "me" row per scope (BOARDS[].rank) anchors the tail curves.
const ANCHOR = { user: { me: 2340, rank: [9, 142, 1204] }, team: { me: 9820, rank: [9, 61, 488] }, org: { me: 18420, rank: [7, 23, 96] } };
const TOTAL = { user: [15, 2200, 9000], team: [12, 180, 1400], org: [8, 60, 260] };
const PF = { week: 0.08, month: 0.28, all: 1 };
const TOP = { area: 15, city: 12, country: 12 };

const boards = {};
for (const subject of ['user', 'team', 'org']) {
  boards[subject] = {};
  SCOPES.forEach((scope, si) => {
    boards[subject][scope] = {};
    for (const p of PERIODS) {
      const rows = pop[subject][scope].map((id) => row(id, p)).sort((a, b) => b.points - a.points).slice(0, TOP[scope]);
      const f = PF[p];
      const { me, rank } = ANCHOR[subject];
      const last = rows[rows.length - 1];
      // [points, rank] descending: estimated rank for rows below the explicit list.
      const tail = scope === 'area'
        ? []
        : [
            [last.points, rows.length + 1],
            [Math.round(me * f), rank[si]],
            [Math.round(me * f * 0.4), Math.round(rank[si] + (TOTAL[subject][si] - rank[si]) * 0.45)],
            [0, TOTAL[subject][si]],
          ].filter((t, i, arr) => i === 0 || t[0] < arr[i - 1][0]);
      boards[subject][scope][p] = { rows, tail };
    }
  });
}

const names = (xs) => Object.fromEntries(xs.map(([id, name]) => [id, name]));
const PEOPLE = names([...AREA_PEOPLE, ...CITY_PEOPLE, ...COUNTRY_PEOPLE, ['u-nadia', 'Nadia Rahman']]);
const M = (user_id, role, points) => ({ user_id, display_name: PEOPLE[user_id], role, points });
const baseStats = (id, all) => ({ points: all, trees: treesOf(all), actions: Math.round(all / 70), cooling_c: coolOf(all) });
const act = (id, user, days_ago, action_type, quantity) => ({ id, user_name: PEOPLE[user], action_type, quantity, points: PTS[action_type] * quantity, days_ago });

const teams = [
  {
    id: HRC, name: 'Hall Rooftop Crew', code: '4K7Q-29', emoji: '🏠', description: 'Cooling the Asad Gate block: white roofs, neem and shade over the hall gate.',
    org_id: DU, owner_id: 'u-nadia', max_members: 5, is_public: true, area: 'Mohammadpur', city: 'Dhaka', country: 'Bangladesh', goal_id: GOAL,
    // Nadia is the owner (the local user in Presentation mode); 4 of 5 places used so the invite flow can be tried.
    members: [M('u-nadia', 'owner', 2340), M('u-rafi', 'admin', 3980), M('u-tania', 'member', 3410), M('u-imran', 'member', 2960)],
    base: { ...baseStats(HRC, hrcBase.all), trees: 9, actions: 41 },
    activity: [
      act('ta-1', 'u-rafi', 1, 'cool_roof', 8), act('ta-2', 'u-tania', 2, 'water_tree', 6), act('ta-3', 'u-imran', 4, 'shade_structure', 2),
      act('ta-4', 'u-rafi', 7, 'plant_tree', 2), act('ta-5', 'u-tania', 12, 'rooftop_garden', 10),
    ],
    tasks: [
      { id: 'k-1', title: 'Coat 120 m² of hostel roof', due: 'Sat 5 Oct', assignee: 'NR', status: 'todo' },
      { id: 'k-2', title: 'Buy 12 tree guards', due: 'Mon 7 Oct', assignee: 'RA', status: 'todo' },
      { id: 'k-3', title: 'Ask hall office for roof key', due: 'This week', assignee: 'TS', status: 'todo' },
      { id: 'k-4', title: 'Book coating supplier', due: 'In progress · 2 quotes', assignee: 'IH', status: 'doing' },
      { id: 'k-5', title: 'Water the 3 Neem', due: 'Twice a week', assignee: 'TS', status: 'doing' },
      { id: 'k-6', title: 'Plant 3 Neem at Asad Gate', due: 'Done 2 Oct · verified', assignee: 'NR', status: 'done' },
      { id: 'k-7', title: 'Survey roofs', due: 'Done 21 Sep', assignee: 'RA', status: 'done' },
      { id: 'k-8', title: 'Set goal', due: 'Done 18 Sep', assignee: 'NR', status: 'done' },
    ],
    evidence: [
      { source: 'Satellite · Landsat 9 LST (v1)', what: 'Roof surface −1.8 °C vs Sep 2025', agrees: true },
      { source: 'Ground · 2 sensors', what: 'Air −0.3 °C · short record', agrees: false },
    ],
  },
  {
    id: 'green-mohammadpur', name: 'Green Mohammadpur', code: 'GM7X-42', emoji: '🌳', description: 'Street trees along Mohammadpur\'s main roads.',
    org_id: null, owner_id: 'u-sumaiya', max_members: 5, is_public: true, area: 'Mohammadpur', city: 'Dhaka', country: 'Bangladesh', goal_id: null,
    members: [M('u-sumaiya', 'owner', 2620), M('u-arif', 'member', 2555), M('u-farhana', 'member', 2480), M('u-jahid', 'member', 2395), M('u-sadia', 'member', 2210)],
    base: baseStats('green-mohammadpur', 21400), activity: [act('ga-1', 'u-arif', 1, 'plant_tree', 4), act('ga-2', 'u-sumaiya', 3, 'water_tree', 12)], tasks: [], evidence: [],
  },
  {
    id: 'lalmatia-roof-club', name: 'Lalmatia Roof Club', code: 'R7CB-58', emoji: '🏡', description: 'Rooftop gardens and white roofs in Lalmatia.',
    org_id: null, owner_id: 'u-mitu', max_members: 5, is_public: true, area: 'Lalmatia', city: 'Dhaka', country: 'Bangladesh', goal_id: null,
    members: [M('u-mitu', 'owner', 2710), M('u-tanvir', 'member', 1990), M('u-nusrat', 'member', 1760)],
    base: baseStats('lalmatia-roof-club', 12800), activity: [act('la-1', 'u-mitu', 2, 'cool_roof', 6)], tasks: [], evidence: [],
  },
  {
    id: 'nilkhet-shade-team', name: 'Nilkhet Shade Team', code: 'NK4S-73', emoji: '🌿', description: 'Shade over the Nilkhet crossing.',
    org_id: DU, owner_id: 'u-kamal', max_members: 5, is_public: true, area: 'Nilkhet', city: 'Dhaka', country: 'Bangladesh', goal_id: null,
    members: [M('u-kamal', 'owner', 1420), M('u-rumana', 'member', 980), M('u-sabbir', 'member', 120)],
    base: baseStats('nilkhet-shade-team', 5110), activity: [], tasks: [], evidence: [],
  },
  {
    id: 'curzon-lawn-keepers', name: 'Curzon Lawn Keepers', code: 'CZ8K-35', emoji: '🌱', description: 'Keeping the Curzon Hall lawn edge green.',
    org_id: DU, owner_id: 'u-joya', max_members: 5, is_public: true, area: 'Shahbag', city: 'Dhaka', country: 'Bangladesh', goal_id: null,
    members: [M('u-joya', 'owner', 7740), M('u-moumita', 'member', 6950)],
    base: baseStats('curzon-lawn-keepers', 2640), activity: [], tasks: [], evidence: [],
  },
  {
    id: 'fuller-road-climbers', name: 'Fuller Road Climbers', code: 'FR9C-64', emoji: '🌿', description: 'Creepers on Fuller Road walls.',
    org_id: DU, owner_id: 'u-rezaul', max_members: 5, is_public: true, area: 'Nilkhet', city: 'Dhaka', country: 'Bangladesh', goal_id: null,
    members: [M('u-rezaul', 'owner', 7310)],
    base: baseStats('fuller-road-climbers', 850), activity: [], tasks: [], evidence: [],
  },
];
const orgs = [
  {
    id: DU, name: 'DU Green Society', kind: 'school', city: 'Dhaka', country: 'Bangladesh', verified: true,
    description: 'University of Dhaka · since 2025', since: '2025', logo_emoji: '🎓',
    team_ids: [HRC, 'nilkhet-shade-team', 'curzon-lawn-keepers', 'fuller-road-climbers'],
    goals: [
      { zone_name: 'Asad Gate block', target_c: -1.5, by_date: '2027-10-01', progress_pct: 38 },
      { zone_name: 'Nilkhet crossing', target_c: -1.0, by_date: '2027-06-01', progress_pct: 61 },
      { zone_name: 'Curzon Hall lawn edge', target_c: -0.5, by_date: '2026-12-01', progress_pct: 90 },
    ],
  },
];
const rising = [
  { team_id: HRC, name: 'Hall Rooftop Crew', up: 5, note: '3 Neem verified · 1,200 m² roof booked' },
  { team_id: 'geneva-camp-gardeners', name: 'Geneva Camp Gardeners', up: 4, note: '40 climbers planted' },
  { team_id: 'lalmatia-roof-club', name: 'Lalmatia Roof Club', up: 3, note: 'First satellite check passed' },
];

// Points per period for entities that can receive live contributions (joined teams, their orgs).
teams.forEach((t) => (t.period_points = ENT.get(t.id).pts));
orgs.forEach((o) => (o.period_points = ENT.get(o.id).pts));

const community = {
  _note: 'Demo community for v0 (fictional people and teams, Mohammadpur · Dhaka). Ported from apps/mobile/src/screens/community/data.ts. Board rows for Hall Rooftop Crew and DU Green Society are BASE values without Nadia\'s contributions, which are merged live (from her story, or from the local store in Presentation mode).',
  area: 'Mohammadpur', city: 'Dhaka', country: 'Bangladesh',
  teams, orgs, rising, boards,
};

fs.writeFileSync(path.join(OUT, 'story.json'), JSON.stringify(story, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'community.json'), JSON.stringify(community, null, 1) + '\n');
console.log('nadia verified', total, 'team week/month/all', nadiaTeam('week'), nadiaTeam('month'), nadiaTeam('all'), 'hrc base', hrcBase, 'nadia all periods', nadiaAll('week'), nadiaAll('month'));
