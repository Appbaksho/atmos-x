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

/** What a value is (prompt-v1 §4 rule 2). The UI shows it on every source chip. */
export type DataKind = 'observation' | 'model' | 'forecast' | 'derived' | 'estimate' | 'reference' | 'demo';

export type Source = { id: string; name: string; url?: string | null; as_of?: string | null; kind?: DataKind | null; resolution_m?: number | null };

/** `live`: fresh from its normal source. `stale`: last-good data beyond its TTL (shown with its date). */
export type Meta = { live: boolean; stale?: boolean; generated_at: string; sources: Source[]; pipeline_version?: string | null };

/** Server text rendered on the client from the `server` i18n namespace: t(`server.${code}`, params). */
export type I18nText = { code: string; params?: Record<string, string | number> };

export type ApiError = { code: string; message: string; fields?: Record<string, string>; retry_after?: number };

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

export type Role = 'guest' | 'user' | 'moderator' | 'admin';

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
  /** Presentation mode: signed in as a server demo user (prompt-v1 §8.4) */
  presentation?: boolean;
  bio?: string | null;
  /** Public area label, e.g. "Mohammadpur, Dhaka" */
  area_label?: string | null;
};

export type Level = { level: number; name_code: string; min: number; next: number | null };
export type Badge = { id: string; emoji: string; code: string; earned: boolean; earned_at?: string | null };

/** GET /me/stats. Points come from the ledger; pending points unlock at the tree's 90-day check-in. */
export type MyStats = {
  points: { earned: number; spendable: number; pending: number; spent: number; next_unlock_at: string | null };
  level: Level;
  badges: Badge[];
  trees: number;
  trees_alive: number;
  actions: number;
  actions_pending: number;
  cooling_c: number;
  /** On-time check-ins in a row */
  streak: number;
  rank_area: { area: string; rank: number; of: number } | null;
};

/* ───────────────────────────── Heat now ───────────────────────────── */

export type HeatRisk = 'ok' | 'caution' | 'xcaution' | 'danger' | 'xdanger';
export type BmdLevel = 'mild' | 'moderate' | 'severe' | 'very_severe';

export type ForecastDay = {
  date: string;
  tmax_c: number;
  tmin_c: number | null;
  feels_max_c: number;
  rain_mm: number;
  bmd_level: BmdLevel | null;
  cold_level?: BmdLevel | null;
  rain_class?: string | null;
  heat_risk: HeatRisk;
  /** 'geos_fp' | 'open_meteo' | 'geos_fp+open_meteo' (§7.7 sanity rule) */
  source?: string;
  disagreement?: boolean;
};

export type RecentDay = { date: string; tmax_c: number; tmin_c: number; rain_mm: number | null };

export type Warning = {
  /** 'BMD' only for a real official bulletin; computed-by-us warnings are 'local' */
  source: 'BMD' | 'local';
  level: BmdLevel | 'warning' | 'danger';
  text: I18nText;
  until?: string;
};

export type Conditions = {
  /** Cached place name; null until the worker has named a new place (the app shows its own then) */
  place: string | null;
  /** ISO time of the reading (local time at the place) */
  time: string;
  air_c: number;
  feels_c: number;
  humidity: number;
  wind_kmh: number;
  heat_risk: HeatRisk;
  /** null outside Bangladesh */
  bmd_level: BmdLevel | null;
  cold_level?: BmdLevel | null;
  /** NASA POWER mean daily max for this date, 2001–2025 */
  normal_c: number | null;
  /** today's high minus the normal */
  anomaly_c: number | null;
  normal_status?: 'ready' | 'pending';
  /** NASA POWER, last 7 valid days */
  recent?: RecentDay[];
  /** 5 days */
  forecast: ForecastDay[];
  warnings: Warning[];
  meta: Meta;
};

/* ───────────────────────────── Zones & map ───────────────────────────── */

/** Per-hex label (prompt-v1 §7.1): satellite (Landsat/MODIS), estimate (land cover), no_data. */
export type HexLabel = 'satellite' | 'estimate' | 'no_data';

export type HexCell = { h3: string; score: number | null; lst_c: number | null; label: HexLabel };

export type DriverContribution = { driver: 'sealed' | 'green' | 'water' | 'dark_surface'; value: number; unit: string; adds_c: number };

export type ZoneDrivers = {
  sealed_pct: number | null;
  green_pct: number | null;
  water_pct?: number | null;
  ndvi: number | null;
  /** Share of built 30 m pixels with Landsat albedo < 0.15 ("dark surfaces") */
  dark_roof_pct: number | null;
  pop_density_km2: number | null;
  night_lst_c: number | null;
  /** Fields that are assumptions rather than measurements */
  estimated?: string[];
  /** °C each driver adds versus the area mean (fit on measured hexes, §7.4) */
  contributions?: DriverContribution[];
  /** °C not explained by land cover */
  other_c?: number | null;
  anom_day_c?: number | null;
  anom_night_c?: number | null;
  fit?: { r2: number | null; n: number; label: 'derived' | 'estimate' } | null;
  /** Latest Landsat acquisition behind the numbers */
  as_of?: string | null;
};

/** One immutable zone row (§7.3): list and detail return the same id, name, score, dist_m and h3. */
export type ZoneSummary = {
  id: string;
  scan_id?: string;
  /** Stored name; '' while unnamed (render name_text then) */
  name: string;
  name_text?: I18nText | null;
  score: number;
  /** Landsat surface temperature, °C (not air temperature) */
  lst_c: number | null;
  label?: HexLabel;
  dist_m: number;
  rank: number;
  near_tie: boolean;
  centroid: LatLng;
  h3: string[];
  area_km2?: number;
  drivers?: ZoneDrivers;
};

export type ScanAcquired = {
  lst_from: string | null;
  lst_to: string | null;
  lst_scenes: number;
  ndvi_date: string | null;
  worldcover_year: number | null;
  ecostress_passes: number;
  night_source?: string | null;
  night_to?: string | null;
  window_days?: number | null;
};

export type ZonesScan = {
  scan: {
    id: string;
    center: LatLng;
    center_cell: string;
    radius_m: number;
    k: number;
    h3_res: number;
    /** hexes in the ring, from the scan (H4) */
    cell_count: number;
    place: string | null;
    status: 'complete' | 'partial' | 'unavailable';
    /** poll GET /scan-jobs/{id} while partial */
    job_id: string | null;
    acquired: ScanAcquired;
    baseline_lst_c: number | null;
    method: 'landsat' | 'modis' | 'landcover';
    /** Outline of the hex ring, GeoJSON polygon rings ([lng, lat]) */
    outline: number[][][];
  };
  hexes: HexCell[];
  zones: ZoneSummary[];
  my_zone_id: string | null;
  satellite_cells?: number;
  meta: Meta;
};

export type ScanJob = { status: 'queued' | 'running' | 'done' | 'failed'; progress: number; done_cells: number; total_cells: number };

export type HistoryPoint = { year: number; day_lst_c: number | null; night_lst_c: number | null };

export type ZoneDetail = ZoneSummary & {
  air_c: number | null;
  feels_c: number | null;
  causes: I18nText[];
  /** 2–3 deterministic sentences built from the measured drivers (§7.4) */
  why: I18nText[];
  what_if_green: { add_green_pct: number; score_after: number | null; lst_drop_c: number; label?: string };
  /** Hot-season MODIS surface temperature per year at the zone's 5 km² chunk (1 km context) */
  history: HistoryPoint[];
  history_kind: 'lst';
  history_status?: 'ready' | 'pending' | 'unavailable';
  /** Newer satellite data made a newer zone for this place */
  superseded_by: string | null;
  place?: string | null;
  meta: Meta;
};

export type Projection = {
  years: number[];
  without_c: number[];
  with_c: number[];
  now_c?: number;
  warming_source?: 'cmip6' | 'modis_trend' | 'none';
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
  zone_area_m2?: number;
  /** pending while the OpenStreetMap job runs (Overpass is often slow) */
  status?: 'ready' | 'pending' | 'failed';
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
  /** Under 3 years a goal is stated in actions (trees, roof m²) with the long-term °C alongside (G3) */
  kind?: 'action' | 'cooling';
  targets?: { trees?: number; roof_m2?: number; shade?: number; long_term_c?: number };
  progress_pct: number;
  /** °C at maturity from verified actions */
  modeled_c: number;
  done?: { trees: number; roof_m2: number; shade: number };
  team_id: string | null;
  org_id: string | null;
  status?: 'active' | 'done' | 'archived';
  owner_id?: string;
  created_at: string;
};

export type GoalTaskItem = { id: string; title: I18nText; action_type: ActionTypeId | null; qty: number | null; owner_id: string | null; due: string | null; status: 'todo' | 'doing' | 'done' };

export type Feasibility = {
  feasible: 'yes' | 'stretch' | 'no';
  needed: { trees: number; roof_m2: number; shade: number };
  capacity?: { trees: number; roof_m2: number } | null;
  spots_available: { ground_m2: number; roof_m2: number; roadside_m?: number };
  /** °C reachable by the date with the space available */
  achievable_c?: number | null;
  /** Largest target ≤ 85 % of what is achievable by the date (negative), or null when space is unknown */
  recommended_target_c?: number | null;
  kind?: 'action' | 'cooling';
  spots_status?: 'ready' | 'pending';
  years?: number;
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

export type PlanStep = { title: I18nText | string; detail: I18nText | string };

export type Plan = {
  goal_id: string | null;
  feasibility: Feasibility;
  actions: PlanAction[];
  species: SpeciesSummary[];
  steps: PlanStep[];
  next_task: { action_type: ActionTypeId; text: I18nText | string } | null;
  budget: Budget;
  /** Care for the first two years, as short sentences */
  care_plan?: I18nText[] | null;
  species_total?: number;
  zone_id?: string;
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
  kind?: 'tree' | 'climber';
  estimate?: boolean;
  /** Outside Bangladesh: a widely planted urban tree, not a native claim; check with a local nursery */
  commonly_planted?: boolean;
};

export type Species = SpeciesSummary & {
  /** 'monsoon' | 'local' */
  planting_season: string;
  /** 'fast' | 'medium' | 'slow' */
  growth: string;
  notes: (I18nText | string)[];
  cooling_c_at_maturity?: number;
  native_regions: string[];
  estimate?: boolean;
  meta?: Meta;
};

export type Nursery = {
  id: string;
  name: string | null;
  partner?: boolean;
  kind?: string;
  location: LatLng;
  dist_m: number;
  phone?: string | null;
  hours?: string | null;
  osm_url?: string | null;
  address?: string | null;
};

export type NurseriesResponse = { nurseries: Nursery[]; status?: 'ready' | 'pending'; meta: Meta };

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

/** One deterministic evidence check (§7.11). `skip` = not applicable or not measurable. */
export type ActionCheckCode =
  | 'gps_present'
  | 'gps_near'
  | 'location_plausible'
  | 'time_recent'
  | 'capture_source'
  | 'not_duplicate'
  | 'content_plausible'
  | 'photo_present'
  | 'gps_near_tree'
  | 'imported';
export type ActionCheck = { code: ActionCheckCode | string; status: 'pass' | 'fail' | 'skip'; reason: string | null; params?: Record<string, number | string> };

/** GET /actions/mine, /actions/{id}. `photo_url` and coordinates only for the owner, teammates and moderators. */
export type ActionLog = {
  id: string;
  user_id: string;
  action_type: ActionTypeId;
  quantity: number;
  /** Points awarded (verified) or that the action would earn once reviewed (pending) */
  points: number;
  /** Modelled °C at maturity for the goal zone */
  cooling_c: number;
  trees: number;
  status: VerificationStatus;
  photo_url: string | null;
  lat: number | null;
  lng: number | null;
  taken_at: string | null;
  goal_id: string | null;
  team_id: string | null;
  zone_label: string | null;
  note: string | null;
  checks: ActionCheck[];
  /** First failing check's reason, or `reviewed` / `review_rejected` / `imported` */
  reason_code: string | null;
  capture_source: 'camera' | 'upload';
  /** True when the viewer may confirm or reject it (a teammate or moderator, never the owner) */
  can_review: boolean;
  created_at: string;
};

/** POST /actions (multipart). `photo` is sent as a file. */
export type LogActionInput = {
  action_type: ActionTypeId;
  quantity: number;
  lat: number | null;
  lng: number | null;
  accuracy_m?: number | null;
  taken_at: string;
  photo: Blob | null;
  capture_source?: 'camera' | 'upload';
  goal_id?: string | null;
  team_id?: string | null;
  note?: string | null;
  species_id?: string;
  nickname?: string;
};

export type LogActionResult = { log: ActionLog; trees: Tree[]; milestones: number[] };

/* ───────────────────────────── Trees ───────────────────────────── */

export type TreeHealth = 'healthy' | 'stressed' | 'dead';
export type TreeStatus = 'ok' | 'due' | 'overdue';
/** T3, derived on the server (first match wins). */
export type TreeState = 'verifying' | 'lost' | 'at_risk' | 'needs_water' | 'due' | 'healthy';

export type TreeCheck = {
  id: string;
  tree_id: string;
  photo_url: string | null;
  health: TreeHealth;
  height_cm: number | null;
  note: string | null;
  on_time: boolean;
  checks: ActionCheck[];
  points: number;
  tip: I18nText | null;
  created_at: string;
};

export type Tree = {
  id: string;
  /** The viewer planted it (helpers and teammates can check in but not edit) */
  mine: boolean;
  species_id: string;
  nickname: string;
  planted_at: string;
  age_days: number;
  location: LatLng | null;
  last_check_at: string | null;
  next_due_at: string;
  status: TreeStatus;
  state: TreeState;
  health: TreeHealth;
  photo_url: string | null;
  team_id: string | null;
  action_id: string | null;
  /** The planting action is verified (or the tree was added by hand) */
  verified: boolean;
  milestones: { d90?: string; y1?: string };
  /** Rough °C this tree adds to a 1 km² neighbourhood today (grows with age) */
  cooling_c_est: number;
  rain_7d_mm: number | null;
  rain_source: 'imerg' | 'power' | null;
  /** Detail only: check-ins newest first, care tips */
  checks?: TreeCheck[];
  tips?: I18nText[];
  /** POST /trees/{id}/checks only: the check just made */
  check?: TreeCheck | null;
};

export type TreeInvite = { token: string; path: string; expires_at: string };

/* ───────────────────────────── Community ───────────────────────────── */

export type TeamRole = 'lead' | 'member';

/** A person as shown to others: the avatar only once moderation approved it. */
export type PersonCard = { id: string; display_name: string; avatar_url: string | null };

export type Member = { user_id: string; display_name: string; role: TeamRole; points: number; avatar_url?: string | null };

export type TeamActivity = { id: string; user_id: string; user_name: string; action_type: ActionTypeId; quantity: number; points: number; created_at: string };

export type TeamGoalSummary = { id: string; zone_name: string; target_c: number; by_date: string; progress_pct: number; kind: 'action' | 'cooling' };

/** GET /teams/{id}. `code` only for members; stats come from the points ledger. */
export type Team = {
  id: string;
  name: string;
  code: string | null;
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
  goal?: TeamGoalSummary | null;
  activity?: TeamActivity[];
  emoji?: string | null;
  is_member: boolean;
  my_role: TeamRole | null;
  full: boolean;
  is_demo?: boolean;
};

export type Invite = { code: string; url: string };

export type ChatMessage = { id: string; user: PersonCard | null; body: string; mine: boolean; created_at: string };

export type OrgKind = 'school' | 'ngo' | 'city' | 'company' | 'other';

export type Org = {
  id: string;
  name: string;
  kind: OrgKind;
  city?: string | null;
  country?: string | null;
  verified: boolean;
  teams: { id: string; name: string; emoji?: string | null; stats: Team['stats'] }[];
  totals: { points: number; trees: number; members: number; cooling_c: number };
  description?: string | null;
  goals?: { zone_name: string; target_c: number; by_date: string; progress_pct: number }[];
  logo_emoji?: string | null;
  my_role?: string | null;
  is_demo?: boolean;
};

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
  emoji?: string | null;
  /** E16: where a row links (a person's profile, a team, an org) */
  href?: { screen: string; id: string };
};

/** `status`: 'no_place' when the scope needs a home, city or country the person hasn't set. */
export type Leaderboard = { rows: LeaderboardRow[]; me: LeaderboardRow | null; status?: 'ready' | 'no_place'; since?: string | null; meta: Meta };

export type Post = {
  id: string;
  author: PersonCard | null;
  body: string;
  photo_url: string | null;
  /** The photo waits for moderation (only the author and moderators see it meanwhile) */
  photo_pending: boolean;
  action: { id: string; action_type: ActionTypeId; quantity: number; points: number; cooling_c: number } | null;
  tree_id: string | null;
  team: { id: string; name: string; emoji?: string | null } | null;
  area: string | null;
  city: string | null;
  likes: number;
  liked: boolean;
  comments: number;
  mine: boolean;
  can_delete: boolean;
  is_demo: boolean;
  hidden: boolean;
  created_at: string;
};

export type PostComment = { id: string; author: PersonCard | null; body: string; mine: boolean; can_delete: boolean; hidden: boolean; created_at: string };

export type FeedFilter = 'area' | 'city' | 'following';
export type FeedPage = { posts: Post[]; status: 'ready' | 'no_place' | 'no_follows'; next: string | null };

export type PublicProfile = PersonCard & {
  bio: string | null;
  area: string | null;
  city: string | null;
  points: number;
  level: Level;
  badges: Badge[];
  trees: number;
  actions: number;
  teams: { id: string; name: string; emoji?: string | null }[];
  followers: number;
  following: number;
  is_following: boolean;
  blocked: boolean;
  is_me: boolean;
  is_demo: boolean;
  joined_at: string;
};

export type CommunityEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  place_name: string;
  location: LatLng;
  organizer: PersonCard | null;
  team: { id: string; name: string } | null;
  org: { id: string; name: string } | null;
  sponsor_name: string | null;
  /** R3: shown once moderation approves it (the organizer sees it at once) */
  sponsor_logo_url: string | null;
  capacity: number | null;
  going: number;
  checked_in: number;
  my_rsvp: 'going' | 'maybe' | 'no' | null;
  i_checked_in: boolean;
  checkin_open: boolean;
  group_photo_url: string | null;
  mine: boolean;
  is_demo: boolean;
};

export type ReportReason = 'spam' | 'abuse' | 'nudity' | 'violence' | 'fake' | 'dangerous' | 'other';
export type ReportTarget = 'post' | 'comment' | 'photo' | 'user' | 'action' | 'tree';

export type ModerationQueue = {
  reports: { id: string; target_type: ReportTarget; target_id: string; reason: ReportReason; note: string | null; created_at: string }[];
  photos: { id: string; purpose: string; owner: PersonCard | null; photo_url: string; created_at: string }[];
};

/* ───────────────────────────── Sources (GET /sources) ───────────────────────────── */

export type SourceEntry = {
  id: string;
  name: string;
  url: string | null;
  kind: DataKind;
  licence: string | null;
  credit: string | null;
  used_for: string;
  nasa: boolean;
  status: 'active' | 'idle' | 'unavailable' | string;
  reason: string | null;
  latest_data: string | null;
  resolution_m: number | null;
};
export type SourcesInfo = {
  sources: SourceEntry[];
  active_nasa_count: number;
  heat_score: { text: string; f: string; weights: Record<string, number> };
  driver_fit: { area: string; r2: number; n: number; label: string; as_of: string } | null;
  pipeline_version: string;
};

/* ───────────────────────────── Store and marketplace ───────────────────────────── */

export type StorePartner = { id: string; name: string; logo_url: string | null; logo_emoji: string | null; csr_line: string | null; city: string | null; is_pilot: boolean; is_demo: boolean; products: number };
export type StoreCategory = 'food' | 'home' | 'garden' | 'vouchers';
export type StoreFilter = StoreCategory | 'can_afford';

export type StoreProduct = {
  id: string;
  partner: StorePartner | null;
  name: string;
  description: string | null;
  category: StoreCategory;
  photo_url: string | null;
  emoji: string | null;
  points_price: number;
  stock: number;
  fulfilment: 'pickup' | 'delivery';
  delivery_area: string | null;
  terms: string | null;
  monthly_limit: number;
  outlets: { id: string; name: string; address: string | null; location: LatLng | null }[];
  can_afford: boolean;
  is_demo: boolean;
  /** R16 */
  listed_at: string | null;
  updated_at: string | null;
};

export type StoreListing = { products: StoreProduct[]; pilot: boolean; points?: { spendable: number; pending: number; next_unlock_at: string | null } };

export type StoreOrder = {
  id: string;
  product: { id: string; name: string; emoji: string | null; photo_url: string | null; fulfilment: 'pickup' | 'delivery' } | null;
  partner: StorePartner | null;
  points: number;
  status: 'issued' | 'processing' | 'collected' | 'expired' | 'cancelled';
  voucher: { code: string; expires_at: string; collected_at: string | null } | null;
  delivery_address: string | null;
  created_at: string;
  collected_at: string | null;
};

export type PartnerProduct = StoreProduct & { declared_value_bdt: number; active: boolean; price_band: [number, number] };
export type PartnerPortal = { partner: StorePartner; products: PartnerProduct[]; price_rule: { points_per_bdt: number; tolerance: number } };
export type PartnerProductInput = {
  name: string;
  description?: string | null;
  category: StoreCategory;
  emoji?: string | null;
  points_price: number;
  declared_value_bdt: number;
  stock: number;
  fulfilment: 'pickup' | 'delivery';
  delivery_area?: string | null;
  terms?: string | null;
  monthly_limit?: number;
};
export type PartnerProductPatch = Partial<Pick<PartnerProductInput, 'name' | 'description' | 'points_price' | 'declared_value_bdt' | 'stock' | 'terms'>> & { active?: boolean };
export type SaplingProduct = { id: string; name: string; species_id: string | null; kind: 'sapling' | 'kit'; price_bdt: number; stock: number; photo_url: string | null; nursery: { id: string; name: string; address: string | null; dist_m: number | null }; is_demo: boolean };
export type SaplingListing = { products: SaplingProduct[]; vat_rate: number; payments: boolean };
export type SaplingOrderOut = { id: string; name: string | null; qty: number; amount_bdt: number; vat_bdt: number; total_bdt: number; status: 'unpaid' | 'paid' | 'failed' | 'cancelled'; created_at: string; paid_at: string | null; payment_url?: string | null };
export type MyOrders = { redemptions: StoreOrder[]; saplings: SaplingOrderOut[] };

export type CompanyStatus = 'pending' | 'approved' | 'rejected';
export type CompanyInfo = {
  id: string;
  name: string;
  trade_licence: string;
  tin_bin: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  industry: string;
  status: CompanyStatus;
  review_note: string | null;
  approved_at: string | null;
  documents: { id: string; kind: 'trade_licence' | 'tin_bin' | 'other'; mime: string; size: number }[];
};
export type PackageId = 'tree_impact' | 'store_listing' | 'carbon_credits';
export type CompanyPackage = { id: PackageId; unit: 'tree' | 'year' | 'tonne'; unit_price: number; currency: string; enabled: boolean; note: string; vat_rate: number; bank_transfer_min: number; available_tonnes?: number; co2_kg_per_tree_year?: number };
export type CompanyOrder = { id: string; package: PackageId; qty: number; unit_price: number; subtotal: number; vat_rate: number; vat: number; total: number; currency: string; status: 'unpaid' | 'paid' | 'failed' | 'cancelled' | 'awaiting_transfer'; payment_method: 'sslcommerz' | 'bank_transfer'; created_at: string; paid_at: string | null; note: string | null; payment_url?: string | null };
export type CompanyOverview = {
  trees_funded: number;
  trees_allocated: number;
  trees_alive: number;
  survival_rate: number | null;
  co2e_estimated_t: number;
  co2e_certified_t: number;
  people_reached: number;
  products_redeemed: number;
  has_store_listing: boolean;
  note: string;
  orders: CompanyOrder[];
};
export type EmissionsRow = { year: number; tonnes_co2e: number; offset_target_t: number | null; source_note: string | null; label: 'company_reported' };
export type CompanyInvoice = { id: string; number: string; subtotal: number; vat_rate: number; vat: number; total: number; currency: string; created_at: string };
export type CompanyCertificate = { id: string; kind: 'retirement' | 'impact_report' | 'retirement_record'; serial_from?: string; serial_to?: string; retired_at?: string; created_at?: string };
export type CompanyRegisterInput = {
  name: string;
  trade_licence: string;
  tin_bin: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  industry: string;
  trade_licence_doc: File;
  tin_bin_doc: File;
  other_doc?: File | null;
};
export type AdminOrder = CompanyOrder & { company_id: string; tran_id: string };
export type CreditLotOut = { id: string; project_id: string | null; tonnes: number; serial_prefix: string; state: 'estimated' | 'verified' | 'sold' | 'retired'; standard: string | null; registry_project_id: string | null; auditor: string | null; certified_at: string | null; sold_to_company_id: string | null };

/* ───────────────────────────── Air ───────────────────────────── */

export type AqiCategory = 'good' | 'moderate' | 'usg' | 'unhealthy' | 'very_unhealthy' | 'hazardous';

export type Air = {
  pm25: number;
  /** sensor | openaq | open_meteo | geos_cf (§5.3 chain) */
  pm25_source?: string;
  pm25_kind?: DataKind;
  /** NASA GEOS-CF v2 for the same hour, to compare */
  nasa_pm25?: number | null;
  aqi: number;
  category: AqiCategory;
  dominant: 'pm25' | 'pm10';
  forecast: { date: string; pm25: number; aqi: number; category: AqiCategory; source?: string }[];
  stations: { name: string; dist_m: number; pm25: number; as_of: string }[];
  stations_enabled?: boolean;
  my_sensors: SensorSummary[];
  advice: I18nText[];
  meta: Meta;
};

export type SensorSummary = { id: string; name: string; pm25: number | null; last_seen: string | null; online: boolean };

export type Sensor = SensorSummary & { location: LatLng | null; model?: string | null; created_at: string };

/** POST /sensors returns the ingest token once. */
export type NewSensor = Sensor & { token: string; ingest_url: string };

/* ───────────────────────────── Farmer ───────────────────────────── */

export type CropId = 'boro' | 'aman' | 'aus' | 'potato' | 'wheat' | 'jute' | 'vegetables' | 'maize';
export type StageId = 'seedbed' | 'vegetative' | 'flowering' | 'ripening' | 'harvest';

export type FarmField = { id: string; name: string; crop: CropId; stage: StageId; location: LatLng; area?: number | null; created_at: string };

export type Hazard = 'flood' | 'heat' | 'drought' | 'cold' | 'lightning' | 'rain' | 'storm' | 'disease';
export type AlertLevel = 'danger' | 'warning' | 'watch' | 'info';

export type FarmAlert = {
  /** `<rule>-<from>@<0.1° cell>`: stable while the event lasts */
  id: string;
  rule?: string;
  hazard: Hazard;
  level: AlertLevel;
  emoji?: string;
  title: I18nText | string;
  body: I18nText | string;
  actions: (I18nText | string)[];
  window: { from: string; to: string };
  /** Only the sources this alert used */
  sources: Source[];
  /** "I've done it" was pressed (signed-in users) */
  done?: boolean;
};

export type FarmAlertsResponse = {
  alerts: FarmAlert[];
  region?: string | null;
  field_id?: string | null;
  /** NASA context the rules had: POWER 30-day rain, IMERG last 72 h, SMAP root-zone wetness, LIS/OTD flash rate */
  context?: { rain30_mm: number | null; imerg_72h_mm: number | null; smap_rootzone: number | null; lightning_flash_rate: number | null };
  meta: Meta;
};

/* ───────────────────────────── Notifications ───────────────────────────── */

export type NotificationKind =
  | 'tree_due'
  | 'tree_milestone'
  | 'tree_helper'
  | 'goal_progress'
  | 'team_invite'
  | 'heat_warning'
  | 'farm_alert'
  | 'verification'
  | 'badge'
  | 'like'
  | 'comment'
  | 'mention'
  | 'follow'
  | 'event';

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

/** §6.12 K2: what Ask Atmos can answer. Suggestion chips send these ids directly. */
export type AskIntent =
  | 'why_hot'
  | 'temp_now'
  | 'forecast'
  | 'normal'
  | 'air_now'
  | 'air_advice'
  | 'farm_alerts'
  | 'tree_care'
  | 'tree_due'
  | 'nurseries'
  | 'species'
  | 'goal_progress'
  | 'points'
  | 'data_sources'
  | 'help';

/** POST /ask (JSON) → text/event-stream. Send `message`, `intent`, or both (the chip label and its id). */
export type AskRequest = {
  message?: string;
  intent?: AskIntent;
  screen: ScreenId;
  lang: Locale;
  context?: AskContext;
  crop?: CropId;
  stage?: StageId;
  farmer?: boolean;
};

/** `screen` is a route id (ScreenId or an extra route like `tree`, `trees`, `species`, `about`). */
export type AskAction = { label: I18nText | string; screen: string; params?: Record<string, string> };

/** SSE events from POST /ask (event name = `type`). All text is I18nText, rendered from `server.*`. */
export type AskEvent =
  | { type: 'warning'; source: 'BMD' | 'local'; text: I18nText; level?: string }
  | { type: 'token'; text: I18nText }
  | { type: 'sources'; sources: Source[] }
  | { type: 'action'; action: AskAction }
  | { type: 'notice'; text: I18nText }
  | { type: 'done'; message_id: string; remaining_today: number; intent: string; suggestions: AskIntent[] }
  | { type: 'error'; code: string; message: string };

/* ───────────────────────────── Google sign-in (v0) ───────────────────────────── */

/**
 * "Continue with Google" in v0: the server trades Google's one-time code for the verified identity,
 * and the client keeps the account on the device. Mirrors v1's auth_identities (provider + subject).
 */
export type GoogleAuthConfig = { enabled: boolean; client_id: string | null; meta: Meta };
export type GoogleAuthRequest = { code: string };
export type GoogleIdentity = { provider: 'google'; subject: string; email: string; display_name: string; avatar_url: string | null; meta: Meta };

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
  googleAuth: { method: 'GET', path: '/api/v0/auth/google' }, // → GoogleAuthConfig
  googleAuthExchange: { method: 'POST', path: '/api/v0/auth/google' }, // GoogleAuthRequest → GoogleIdentity
} as const;
