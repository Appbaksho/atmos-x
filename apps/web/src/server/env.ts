import 'server-only';

/** Server-side configuration read from the environment (apps/web/.env.local). Never import from client code. */

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : d;
}

export const env = {
  get openaiKey(): string | undefined {
    return process.env.OPENAI_API_KEY || undefined;
  },
  /** Tool-calling + vision model (Ask Atmos, photo checks). */
  get model(): string {
    return process.env.OPENAI_MODEL || 'gpt-5.5';
  },
  /** Cheaper model for explanations, plan details and species shortlists. */
  get modelCheap(): string {
    return process.env.OPENAI_MODEL_CHEAP || 'gpt-5.4-mini';
  },
  /** Google sign-in (OAuth web client). Both must be set, or "Continue with Google" stays disabled. */
  get google(): { clientId: string | null; clientSecret: string | null } {
    return { clientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim() || null, clientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim() || null };
  },
  get aiDailyCap(): number {
    return num(process.env.AI_DAILY_REQUEST_CAP, 1500);
  },
  /**
   * OSM services require an identifying User-Agent; Nominatim rejects placeholder contacts
   * (example.com), so those fall back to the project URL.
   */
  get userAgent(): string {
    const ua = (process.env.OSM_USER_AGENT || '').trim();
    return ua && !/example\.(com|org)/i.test(ua) ? ua : 'AtmosX/0.1 (+https://github.com/Appbaksho/atmos-x)';
  },
  get overpassUrls(): string[] {
    const list = (process.env.OVERPASS_URLS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length
      ? list
      : [
          'https://overpass-api.de/api/interpreter',
          'https://overpass.private.coffee/api/interpreter',
          'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        ];
  },
  /**
   * Upstream base URLs. Point them at a dead host to rehearse the offline safety net
   * (snapshots / caches): OPEN_METEO_BASE_URL replaces the host of all four Open-Meteo APIs
   * (e.g. http://127.0.0.1:9), or override each one with its own variable.
   */
  get upstream(): { forecast: string; archive: string; air: string; geocoding: string; nominatim: string; nasaPower: string; googleToken: string } {
    const om = (process.env.OPEN_METEO_BASE_URL || '').trim().replace(/\/+$/, '');
    const pick = (own: string | undefined, path: string, host: string) => (own || '').trim() || (om ? `${om}${path}` : `${host}${path}`);
    return {
      forecast: pick(process.env.OPEN_METEO_FORECAST_URL, '/v1/forecast', 'https://api.open-meteo.com'),
      archive: pick(process.env.OPEN_METEO_ARCHIVE_URL, '/v1/archive', 'https://archive-api.open-meteo.com'),
      air: pick(process.env.OPEN_METEO_AIR_URL, '/v1/air-quality', 'https://air-quality-api.open-meteo.com'),
      geocoding: pick(process.env.OPEN_METEO_GEOCODING_URL, '/v1/search', 'https://geocoding-api.open-meteo.com'),
      nominatim: (process.env.NOMINATIM_URL || '').trim() || 'https://nominatim.openstreetmap.org/reverse',
      nasaPower: (process.env.NASA_POWER_URL || '').trim() || 'https://power.larc.nasa.gov/api/temporal',
      googleToken: (process.env.GOOGLE_OAUTH_TOKEN_URL || '').trim() || 'https://oauth2.googleapis.com/token',
    };
  },
  get demo(): { lat: number; lng: number } {
    return { lat: num(process.env.NEXT_PUBLIC_DEMO_LAT, 23.759), lng: num(process.env.NEXT_PUBLIC_DEMO_LNG, 90.359) };
  },
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  },
  /** Directory of the JSON file cache (gitignored). */
  get cacheDir(): string {
    return process.env.ATMOS_CACHE_DIR || `${process.cwd()}/.cache`;
  },
  /** Set ATMOS_LOG=0 to silence timing logs. */
  get log(): boolean {
    return process.env.ATMOS_LOG !== '0' && process.env.NODE_ENV !== 'test';
  },
};
