/**
 * NASA data access.
 *
 *  - MODIS Land Surface Temperature (MOD11A2, 1 km, 8-day composites) through the
 *    ORNL DAAC MODIS Web Service. No API key needed.
 *    https://modis.ornl.gov/data/modis_webservice.html
 *  - NASA POWER daily + climatology near-surface air temperature / rainfall.
 *    https://power.larc.nasa.gov/docs/services/api/
 *  - NASA GIBS WMTS tiles for a visual LST overlay on the map.
 *    https://nasa-gibs.github.io/gibs-api-docs/
 */
import { cached, DAY, getJSON, HOUR } from './http';
import { LatLng, sinusoidalToLatLng } from './geo';

const ORNL = 'https://modis.ornl.gov/rst/api/v1';
const POWER = 'https://power.larc.nasa.gov/api/temporal';

export const GIBS_LST_TILE_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png';
export const GIBS_LST_MAX_ZOOM = 6;

export type LstCell = {
  row: number;
  col: number;
  /** Land surface temperature in °C (null = no valid pixel: cloud or fill) */
  lst: number | null;
  /** Polygon corners (NW, NE, SE, SW) */
  corners: LatLng[];
  center: LatLng;
};

export type LstGrid = {
  center: LatLng;
  radiusKm: number;
  nrows: number;
  ncols: number;
  cellKm: number;
  cells: LstCell[];
  /** Calendar dates (YYYY-MM-DD) of the composites used */
  dates: string[];
  latestDate: string;
  validFraction: number;
  source: string;
};

type OrnlDates = { dates: { modis_date: string; calendar_date: string }[] };
type OrnlSubset = {
  xllcorner: string;
  yllcorner: string;
  cellsize: number;
  nrows: number;
  ncols: number;
  scale: string;
  subset: { modis_date: string; calendar_date: string; data: number[] }[];
};

function round(n: number, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Fetch a 1 km MODIS LST grid around `center`.
 * Uses the last 10 eight-day composites (~80 days) and takes the per-pixel
 * median of cloud-free values, so monsoon cloud cover still yields a usable map.
 */
export async function fetchLstGrid(center: LatLng, radiusKm: number): Promise<LstGrid> {
  const lat = round(center.latitude, 3);
  const lon = round(center.longitude, 3);
  const r = Math.max(1, Math.min(25, Math.round(radiusKm)));
  const key = `lst:${lat}:${lon}:${r}`;

  return cached(key, 12 * HOUR, async () => {
    const dates = await cached(`lstdates:${round(lat, 1)}:${round(lon, 1)}`, DAY, () =>
      getJSON<OrnlDates>(`${ORNL}/MOD11A2/dates?latitude=${lat}&longitude=${lon}`),
    );
    const last = dates.dates.slice(-10);
    if (!last.length) throw new Error('No MODIS composites available for this location.');

    const url =
      `${ORNL}/MOD11A2/subset?latitude=${lat}&longitude=${lon}&band=LST_Day_1km` +
      `&startDate=${last[0].modis_date}&endDate=${last[last.length - 1].modis_date}` +
      `&kmAboveBelow=${r}&kmLeftRight=${r}`;
    const sub = await getJSON<OrnlSubset>(url, { timeoutMs: 45000 });

    const scale = parseFloat(sub.scale) || 0.02;
    const n = sub.nrows * sub.ncols;
    const perPixel: number[][] = Array.from({ length: n }, () => []);
    let latestDate = '';
    for (const comp of sub.subset) {
      let valid = 0;
      comp.data.forEach((v, i) => {
        if (v > 0) {
          perPixel[i].push(v * scale - 273.15);
          valid++;
        }
      });
      if (valid > n * 0.2) latestDate = comp.calendar_date;
    }

    const xll = parseFloat(sub.xllcorner);
    const yll = parseFloat(sub.yllcorner);
    const cs = sub.cellsize;
    const yTop = yll + sub.nrows * cs;

    const cells: LstCell[] = [];
    let validCount = 0;
    for (let row = 0; row < sub.nrows; row++) {
      for (let col = 0; col < sub.ncols; col++) {
        const i = row * sub.ncols + col;
        const vals = perPixel[i];
        const lst = vals.length ? round(median(vals), 1) : null;
        if (lst != null) validCount++;
        const x0 = xll + col * cs;
        const x1 = x0 + cs;
        const y0 = yTop - row * cs;
        const y1 = y0 - cs;
        cells.push({
          row,
          col,
          lst,
          corners: [
            sinusoidalToLatLng(x0, y0),
            sinusoidalToLatLng(x1, y0),
            sinusoidalToLatLng(x1, y1),
            sinusoidalToLatLng(x0, y1),
          ],
          center: sinusoidalToLatLng(x0 + cs / 2, y0 - cs / 2),
        });
      }
    }

    return {
      center: { latitude: lat, longitude: lon },
      radiusKm: r,
      nrows: sub.nrows,
      ncols: sub.ncols,
      cellKm: cs / 1000,
      cells,
      dates: sub.subset.map((s) => s.calendar_date),
      latestDate: latestDate || sub.subset[sub.subset.length - 1]?.calendar_date || '',
      validFraction: validCount / n,
      source: 'NASA MODIS Terra MOD11A2 LST (1 km, 8-day) via ORNL DAAC',
    };
  });
}

/* ---------------------------------------------------------------- POWER ---- */

export type PowerDaily = {
  dates: string[];
  tmax: (number | null)[];
  tmean: (number | null)[];
  rain: (number | null)[];
  rh: (number | null)[];
};

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export async function fetchPowerDaily(center: LatLng, days = 30): Promise<PowerDaily> {
  const lat = round(center.latitude, 2);
  const lon = round(center.longitude, 2);
  const end = new Date(Date.now() - 1 * DAY);
  const start = new Date(end.getTime() - (days - 1) * DAY);
  return cached(`power:${lat}:${lon}:${days}:${ymd(end)}`, 6 * HOUR, async () => {
    const url =
      `${POWER}/daily/point?parameters=T2M_MAX,T2M,PRECTOTCORR,RH2M&community=AG` +
      `&longitude=${lon}&latitude=${lat}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`;
    const j = await getJSON<any>(url, { timeoutMs: 40000 });
    const p = j.properties.parameter;
    const dates = Object.keys(p.T2M_MAX);
    const clean = (o: Record<string, number>) =>
      dates.map((d) => (o[d] == null || o[d] <= -900 ? null : o[d]));
    return {
      dates,
      tmax: clean(p.T2M_MAX),
      tmean: clean(p.T2M),
      rain: clean(p.PRECTOTCORR),
      rh: clean(p.RH2M),
    };
  });
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 20-year (2001-2020) monthly mean air temperature, °C. */
export async function fetchPowerClimatology(center: LatLng): Promise<Record<string, number>> {
  const lat = round(center.latitude, 1);
  const lon = round(center.longitude, 1);
  return cached(`powerclim:${lat}:${lon}`, 30 * DAY, async () => {
    const url = `${POWER}/climatology/point?parameters=T2M&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
    const j = await getJSON<any>(url, { timeoutMs: 40000 });
    return j.properties.parameter.T2M as Record<string, number>;
  });
}

export type AirSummary = {
  recentTmax: number | null;
  recentTmean: number | null;
  normalTmean: number | null;
  anomaly: number | null;
  rain30: number | null;
  series: { date: string; tmax: number | null }[];
};

export async function fetchAirSummary(center: LatLng): Promise<AirSummary> {
  const [daily, clim] = await Promise.all([
    fetchPowerDaily(center, 30),
    fetchPowerClimatology(center).catch(() => null),
  ]);
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const last7 = (xs: (number | null)[]) => xs.slice(-7);
  const recentTmax = mean(last7(daily.tmax));
  const recentTmean = mean(last7(daily.tmean));
  const month = MONTHS[new Date().getMonth()];
  const normalTmean = clim ? clim[month] ?? null : null;
  const rainVals = daily.rain.filter((x): x is number => x != null);
  return {
    recentTmax: recentTmax != null ? round(recentTmax, 1) : null,
    recentTmean: recentTmean != null ? round(recentTmean, 1) : null,
    normalTmean,
    anomaly:
      recentTmean != null && normalTmean != null ? round(recentTmean - normalTmean, 1) : null,
    rain30: rainVals.length ? round(rainVals.reduce((a, b) => a + b, 0), 0) : null,
    series: daily.dates.map((d, i) => ({ date: d, tmax: daily.tmax[i] })),
  };
}
