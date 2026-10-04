/**
 * Atmos X data contract. These are the shapes from prompt-v1.md §5, snake_case on purpose, so that
 * in v1 the FastAPI client can replace the v0 implementation (`/api/v0/*` route handlers +
 * IndexedDB) without touching any screen.
 *
 * Shared by: V0-1 (UI), V0-2 (server route handlers), V0-3 (local store + hooks).
 * Changing a shape is a contract change: add fields freely, rename only with the Integrator.
 */

/* ───────────────────────────── Primitives ───────────────────────────── */

export type LatLng = { lat: number; lng: number };

export type Source = { id: string; name: string; url?: string; as_of?: string };

/** Attached to every data response. `live: false` = served from snapshot / fallback / seed. */
export type Meta = { live: boolean; generated_at: string; sources: Source[] };

/** Server text rendered on the client from the `server` i18n namespace: t(`server.${code}`, params). */
export type I18nText = { code: string; params?: Record<string, string | number> };

export type ApiError = { code: string; message: string };

export const LOCALES = ['en', 'bn', 'ur', 'hi', 'ar', 'es', 'fr', 'pt', 'id', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const RTL_LOCALES: readonly Locale[] = ['ur', 'ar'];

/** Prototype screen IDs (same as apps/mobile/src/lib/cz/routes.ts). */
export type ScreenId =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10'
  | 'S11' | 'S12' | 'S13' | 'S14' | 'S15' | 'S16' | 'S17' | 'S18' | 'S19' | 'S20'
  | 'S21' | 'S22' | 'S26' | 'S27' | 'S28' | 'S29' | 'F01' | 'F02' | 'F03';

export type Money = { amount: number; currency: string };

/* ───────────────────────────── Users & prefs ───────────────────────────── */

export type Role = 'guest' | 'user' | 'admin';

export type User = {
  id: string;
  role: Role;
  email: string | null;
  display_name: string;
  avatar_url?: string | null;
  created_at: string;
};

export type Unit = 'C' | 'F';
export type AreaUnit = 'metric' | 'imperial';
export type ThemePref = 'light' | 'dark' | 'system';

export type Profile = {
  display_name: string;
  avatar_url?: string | null;
  home: LatLng | null;
  /** 100–1000 */
  radius_m: number;
  lang: Locale;
  unit: Unit;
  area: AreaUnit;
  theme: ThemePref;
  farmer_mode: boolean;
  ask_on: boolean;
  onboarded: boolean;
  /** v0 only: Presentation mode (demo story loaded, location pinned to Dhaka) */
  presentation?: boolean;
};

export type Level = { level: number; name_code: string; min: number; next: number | null };
export type Badge = { id: string; emoji: string; code: string; earned: boolean };

export type MyStats = {
  points: number;
  /** Points of actions still pending verification */
  provisional_points: number;
  level: Level;
  badges: Badge[];
  trees: number;
  actions: number;
  cooling_c: number;
  rank_area?: number | null;
};

/* ───────────────────────────── Heat now ───────────────────────────── */

export type HeatRisk = 'ok' | 'caution' | 'xcaution' | 'danger' | 'xdanger';
export type BmdLevel = 'mild' | 'moderate' | 'severe' | 'very_severe';

export type ForecastDay = {
  date: string;
  tmax_c: number;
  tmin_c: number;
  feels_max_c: number;
  rain_mm: number;
  bmd_level: BmdLevel | null;
  heat_risk: HeatRisk;
};

export type Warning = {
  /** 'BMD' only for a real official bulletin; computed-by-us warnings are 'local' */
  source: 'BMD' | 'local';
  level: BmdLevel | 'warning' | 'danger';
  text: I18nText;
  until?: string;
};

export type Conditions = {
  place: string;
  /** ISO time of the reading */
  time: string;
  air_c: number;
  feels_c: number;
  humidity: number;
  wind_kmh: number;
  heat_risk: HeatRisk;
  /** null outside Bangladesh */
  bmd_level: BmdLevel | null;
  normal_c: number | null;
  anomaly_c: number | null;
  /** 5 days */
  forecast: ForecastDay[];
  warnings: Warning[];
  meta: Meta;
};

/* ───────────────────────────── Zones & map ───────────────────────────── */

export type HexCell = { h3: string; score: number; lst_c: number };

export type ZoneSummary = {
  id: string;
  name: string;
  score: number;
  /** v0: estimated surface temperature (°C); v1: Landsat LST */
  lst_c: number;
  dist_m: number;
  rank: number;
  near_tie: boolean;
  centroid: LatLng;
  h3: string[];
};

export type ZonesScan = {
  scan: {
    center: LatLng;
    radius_m: number;
    h3_res: number;
    acquired: { lst_date: string | null; ndvi_date: string | null };
    baseline_lst_c: number;
    /** v0: 'osm-proxy' | 'synthetic'; v1: 'landsat' | 'modis' … */
    method: string;
  };
  hexes: HexCell[];
  zones: ZoneSummary[];
  my_zone_id: string | null;
  meta: Meta;
};

export type ZoneDrivers = {
  sealed_pct: number;
  green_pct: number;
  ndvi: number | null;
  dark_roof_pct: number | null;
  /** v0: building density per hectare as a proxy */
  pop_density_km2: number | null;
  night_lst_c: number | null;
  /** Drivers that are assumptions rather than measurements */
  estimated?: (keyof Omit<ZoneDrivers, 'estimated'>)[];
};

export type HistoryPoint = { year: number; day_lst_c: number | null; night_lst_c: number | null };

export type ZoneDetail = {
  id: string;
  name: string;
  score: number;
  lst_c: number;
  air_c: number;
  feels_c: number;
  centroid: LatLng;
  h3: string[];
  drivers: ZoneDrivers;
  causes: I18nText[];
  /** AI plain-language explanation in the requested language (v0) */
  why_text?: string | null;
  what_if_green: { add_green_pct: number; score_after: number; lst_drop_c: number };
  /** ~20 years. v0: hot-season air temperature from Open-Meteo archive (label it so). */
  history: HistoryPoint[];
  history_kind: 'air_temp' | 'lst';
  meta: Meta;
};

export type Projection = {
  years: number[];
  without_c: number[];
  with_c: number[];
  assumptions: I18nText[];
  meta: Meta;
};

export type PlantingSpotKind = 'ground' | 'roof' | 'roadside';

export type PlantingSpotFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'Polygon'; coordinates: number[][][] };
  properties: { id: string; kind: PlantingSpotKind; area_m2: number; suitability: number; name?: string | null };
};

export type PlantingSpots = {
  type: 'FeatureCollection';
  features: PlantingSpotFeature[];
  totals: { ground_m2: number; roof_m2: number; roadside_m: number };
  meta: Meta;
};

/* ───────────────────────────── Goals & plan ───────────────────────────── */

export type Goal = {
  id: string;
  zone_id: string;
  zone_name: string;
  zone_centroid: LatLng;
  /** Negative = cooling target, e.g. -1.5 */
  target_c: number;
  by_date: string;
  progress_pct: number;
  modeled_c: number;
  team_id: string | null;
  org_id: string | null;
  created_at: string;
};

export type Feasibility = {
  feasible: 'yes' | 'stretch' | 'no';
  needed: { trees: number; roof_m2: number; shade: number };
  spots_available: { ground_m2: number; roof_m2: number };
  notes: I18nText[];
};

export type ActionTypeId =
  | 'plant_tree'
  | 'plant_shrubs'
  | 'rooftop_garden'
  | 'cool_roof'
  | 'green_wall'
  | 'shade_structure'
  | 'water_tree'
  | 'awareness';

export type PlanAction = {
  action_type: ActionTypeId;
  qty: number;
  cooling_c: number;
  cost: Money;
  water_l_week: number;
  effort: 'low' | 'medium' | 'high';
  why: I18nText | string;
  /** true when the value came from the AI rather than deterministic maths */
  estimate?: boolean;
};

export type BudgetLine = { label: I18nText | string; qty: number; unit_cost: Money; total: Money; estimate?: boolean };

export type Budget = { lines: BudgetLine[]; total: Money; water_l_week: number; care_per_year: Money };

export type PlanStep = { title: string; detail: string };

export type Plan = {
  goal_id: string;
  feasibility: Feasibility;
  actions: PlanAction[];
  species: SpeciesSummary[];
  steps: PlanStep[];
  next_task: { action_type: ActionTypeId; text: string } | null;
  budget: Budget;
  /** AI care plan for the first two years (v0, estimate) */
  care_plan?: string | null;
  meta: Meta;
};

/** v0 body of POST /api/v0/plan (goals are local in v0, so the client sends them). */
export type PlanRequest = {
  goal: Pick<Goal, 'id' | 'zone_id' | 'zone_name' | 'zone_centroid' | 'target_c' | 'by_date'>;
  zone?: Pick<ZoneDetail, 'drivers' | 'score' | 'lst_c' | 'h3'> | null;
  lang: Locale;
};

export type SpeciesSummary = {
  id: string;
  name: string;
  local_name?: string | null;
  scientific: string;
  emoji?: string;
  canopy_m: number;
  cooling: 'high' | 'medium' | 'low';
  water: 'high' | 'medium' | 'low';
  price?: Money | null;
  image_url?: string | null;
};

export type Species = SpeciesSummary & {
  planting_season: string;
  growth: string;
  notes: string[];
  native_regions: string[];
  estimate?: boolean;
  meta?: Meta;
};

export type Nursery = {
  id: string;
  name: string;
  location: LatLng;
  dist_m: number;
  phone?: string | null;
  hours?: string | null;
  osm_url?: string | null;
  address?: string | null;
};

export type NurseriesResponse = { nurseries: Nursery[]; meta: Meta };

/* ───────────────────────────── Actions & verification ───────────────────────────── */

export type ActionType = {
  id: ActionTypeId;
  title_code: string;
  unit_code: string;
  points: number;
  cooling_per_unit: number;
  is_tree: boolean;
  emoji?: string;
};

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type ActionLog = {
  id: string;
  action_type: ActionTypeId;
  quantity: number;
  points: number;
  cooling_c: number;
  trees: number;
  status: VerificationStatus;
  /** v0: object URL / IndexedDB key; v1: /media URL */
  photo_url: string | null;
  lat: number | null;
  lng: number | null;
  taken_at: string | null;
  goal_id: string | null;
  team_id: string | null;
  zone_label: string | null;
  note: string | null;
  verification?: VerifyPhotoResult | null;
  created_at: string;
};

export type LogActionInput = {
  action_type: ActionTypeId;
  quantity: number;
  lat: number | null;
  lng: number | null;
  taken_at: string;
  photo: Blob | null;
  goal_id?: string | null;
  team_id?: string | null;
  note?: string | null;
};

export type VerifyPhotoRequest = {
  /** data URL, ≤ 768 px */
  image: string;
  action_type: ActionTypeId;
  quantity: number;
  taken_at: string;
  lat: number | null;
  lng: number | null;
  target: LatLng | null;
  lang: Locale;
};

export type VerifyPhotoResult = {
  status: 'verified' | 'pending';
  confidence: number;
  /** Short description of what the AI saw, in the requested language */
  seen: string;
  reason_code: string;
  meta?: Meta;
};

/* ───────────────────────────── Trees ───────────────────────────── */

export type TreeHealth = 'healthy' | 'stressed' | 'dead';
export type TreeStatus = 'ok' | 'due' | 'overdue';

export type TreeCheck = {
  id: string;
  tree_id: string;
  photo_url: string | null;
  health: TreeHealth;
  note: string | null;
  ai?: TreeCheckResult | null;
  points: number;
  created_at: string;
};

export type Tree = {
  id: string;
  species_id: string;
  nickname: string;
  planted_at: string;
  location: LatLng | null;
  last_check_at: string | null;
  next_due_at: string;
  status: TreeStatus;
  health: TreeHealth;
  photo_url: string | null;
  checks?: TreeCheck[];
};

export type TreeCheckRequest = { image: string; species_id: string; lang: Locale };
export type TreeCheckResult = { health: TreeHealth; confidence: number; tip: string; seen: string; meta?: Meta };

/* ───────────────────────────── Community ───────────────────────────── */

export type TeamRole = 'owner' | 'admin' | 'member';

export type Member = { user_id: string; display_name: string; role: TeamRole; points: number; avatar_url?: string | null };

export type TeamActivity = { id: string; user_name: string; action_type: ActionTypeId; quantity: number; points: number; created_at: string };

export type Team = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  org_id: string | null;
  org_name?: string | null;
  owner_id: string;
  max_members: number;
  is_public: boolean;
  area?: string | null;
  city?: string | null;
  country?: string | null;
  members: Member[];
  stats: { points: number; trees: number; actions: number; cooling_c: number };
  goal_id?: string | null;
  activity?: TeamActivity[];
  emoji?: string;
  /** v0 additive (V0-3): S17 task board and evidence rows */
  tasks?: TeamTask[];
  evidence?: TeamEvidence[];
};

/** v0 additive (V0-3) */
export type TeamTask = { id: string; title: string; due: string; assignee: string; status: 'todo' | 'doing' | 'done' };
/** v0 additive (V0-3) */
export type TeamEvidence = { source: string; what: string; agrees: boolean };
/** v0 additive (V0-3): the "Rising" board on S16 */
export type RisingTeam = { team_id: string; name: string; up: number; note: string };

export type Invite = { code: string; url: string };

export type OrgKind = 'school' | 'ngo' | 'city' | 'company' | 'other';

export type Org = {
  id: string;
  name: string;
  kind: OrgKind;
  city?: string | null;
  country?: string | null;
  verified: boolean;
  teams: Pick<Team, 'id' | 'name' | 'stats' | 'emoji'>[];
  totals: { points: number; trees: number; members: number; cooling_c: number };
  description?: string | null;
  logo_url?: string | null;
  /** v0 additive (V0-3): S18 goals across zones */
  goals?: { zone_name: string; target_c: number; by_date: string; progress_pct: number }[];
  logo_emoji?: string;
};

/** 'org' added in v0 (V0-3, additive) for the Orgs board on S16 */
export type LeaderboardSubject = 'user' | 'team' | 'org';
export type LeaderboardScope = 'area' | 'city' | 'country';
export type Period = 'week' | 'month' | 'all';

export type LeaderboardRow = {
  rank: number;
  id: string;
  name: string;
  points: number;
  trees: number;
  cooling_c: number;
  is_me: boolean;
  avatar_url?: string | null;
  emoji?: string;
};

export type Leaderboard = { rows: LeaderboardRow[]; me: LeaderboardRow | null; meta: Meta };

/* ───────────────────────────── Air ───────────────────────────── */

export type AqiCategory = 'good' | 'moderate' | 'usg' | 'unhealthy' | 'very_unhealthy' | 'hazardous';

export type Air = {
  pm25: number;
  aqi: number;
  category: AqiCategory;
  dominant: 'pm25' | 'pm10';
  forecast: { date: string; pm25: number; aqi: number; category: AqiCategory }[];
  stations: { name: string; dist_m: number; pm25: number; as_of: string }[];
  my_sensors: SensorSummary[];
  advice: I18nText[];
  meta: Meta;
};

export type SensorSummary = { id: string; name: string; pm25: number | null; last_seen: string | null; online: boolean; simulated?: boolean };

export type Sensor = SensorSummary & { location: LatLng | null; model?: string | null; created_at: string };

/* ───────────────────────────── Farmer ───────────────────────────── */

export type CropId = 'boro' | 'aman' | 'aus' | 'potato' | 'wheat' | 'jute' | 'vegetables' | 'maize';
export type StageId = 'seedbed' | 'vegetative' | 'flowering' | 'ripening' | 'harvest';

export type FarmField = { id: string; name: string; crop: CropId; stage: StageId; location: LatLng; area?: number | null; created_at: string };

export type Hazard = 'flood' | 'heat' | 'drought' | 'cold' | 'lightning' | 'rain' | 'storm' | 'disease';
export type AlertLevel = 'danger' | 'warning' | 'watch' | 'info';

export type FarmAlert = {
  id: string;
  hazard: Hazard;
  level: AlertLevel;
  emoji?: string;
  title: I18nText | string;
  body: I18nText | string;
  actions: (I18nText | string)[];
  window: { from: string; to: string };
  sources: Source[];
};

export type FarmAlertsResponse = { alerts: FarmAlert[]; region?: string | null; meta: Meta };

/* ───────────────────────────── Notifications ───────────────────────────── */

export type NotificationKind = 'tree_due' | 'goal_progress' | 'team_invite' | 'heat_warning' | 'farm_alert' | 'verification';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: I18nText;
  body?: I18nText | null;
  screen?: ScreenId | null;
  params?: Record<string, string>;
  read: boolean;
  created_at: string;
};

/* ───────────────────────────── Geo ───────────────────────────── */

export type Place = { name: string; admin?: string | null; country?: string | null; country_code?: string | null; location: LatLng };
export type ReverseGeocode = { place: string; city: string | null; country: string | null; country_code: string | null; meta: Meta };
export type GeoSearchResponse = { results: Place[]; meta: Meta };

/* ───────────────────────────── Ask Atmos ───────────────────────────── */

export type AskContext = { lat?: number; lng?: number; zone_id?: string; tree_id?: string; field_id?: string };

export type AskClientState = {
  profile: 'guest' | 'user';
  units: Unit;
  farmer: boolean;
  /** Compact summaries only (≤ 6 KB total) */
  trees?: Pick<Tree, 'id' | 'nickname' | 'species_id' | 'status' | 'health' | 'next_due_at'>[];
  goal?: Pick<Goal, 'zone_name' | 'target_c' | 'by_date' | 'progress_pct'> | null;
  visible?: Record<string, unknown>;
};

export type AskTurn = { role: 'user' | 'assistant'; text: string };

export type AskRequest = {
  message: string;
  screen: ScreenId;
  lang: Locale;
  context?: AskContext;
  client_state?: AskClientState;
  history?: AskTurn[];
  /** data URL ≤ 4 MB */
  image?: string | null;
};

export type AskAction = { label: I18nText | string; screen: ScreenId; params?: Record<string, string> };

/** SSE events streamed by POST /api/v0/ask (event name = `type`). */
export type AskEvent =
  | { type: 'warning'; source: 'BMD' | 'local'; text: string }
  | { type: 'token'; text: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'action'; action: AskAction }
  | { type: 'notice'; text: string }
  | { type: 'done'; message_id: string; remaining_today: number }
  | { type: 'error'; code: string; message: string };

/* ───────────────────────────── v0 route table ───────────────────────────── */

/** Every v0 server endpoint (Next.js route handlers under src/app/api/v0). Query params are strings. */
export const V0_ROUTES = {
  conditions: { method: 'GET', path: '/api/v0/conditions' }, // ?lat&lng&lang → Conditions
  geoReverse: { method: 'GET', path: '/api/v0/geo/reverse' }, // ?lat&lng&lang → ReverseGeocode
  geoSearch: { method: 'GET', path: '/api/v0/geo/search' }, // ?q&lang → GeoSearchResponse
  zones: { method: 'GET', path: '/api/v0/zones' }, // ?lat&lng&radius_m&lang → ZonesScan
  zone: { method: 'GET', path: '/api/v0/zones/[id]' }, // ?lang → ZoneDetail
  projection: { method: 'GET', path: '/api/v0/zones/[id]/projection' }, // ?trees&roof_m2&shade → Projection
  plantingSpots: { method: 'GET', path: '/api/v0/zones/[id]/planting-spots' }, // → PlantingSpots
  plan: { method: 'POST', path: '/api/v0/plan' }, // PlanRequest → Plan
  species: { method: 'GET', path: '/api/v0/species' }, // ?lat&lng&lang → { species: SpeciesSummary[], meta }
  speciesOne: { method: 'GET', path: '/api/v0/species/[id]' }, // ?lat&lng&lang → Species
  nurseries: { method: 'GET', path: '/api/v0/nurseries' }, // ?lat&lng&radius_m → NurseriesResponse
  air: { method: 'GET', path: '/api/v0/air' }, // ?lat&lng → Air (my_sensors filled client-side)
  farmAlerts: { method: 'GET', path: '/api/v0/farm/alerts' }, // ?lat&lng&crop&stage&lang → FarmAlertsResponse
  verifyPhoto: { method: 'POST', path: '/api/v0/verify-photo' }, // VerifyPhotoRequest → VerifyPhotoResult
  treeCheck: { method: 'POST', path: '/api/v0/tree-check' }, // TreeCheckRequest → TreeCheckResult
  ask: { method: 'POST', path: '/api/v0/ask' }, // AskRequest → text/event-stream of AskEvent
} as const;
