/**
 * 7-day forecast from Open-Meteo (free, no key). NASA POWER is observational,
 * so forecasts for farmer alerts come from here.
 */
import { cached, getJSON, HOUR } from './http';
import { LatLng } from './geo';

export type DailyForecast = {
  date: string;
  tmax: number;
  tmin: number;
  rain: number;
  rainProb: number;
  gust: number;
  wind: number;
  et0: number;
  code: number;
};

export type HourlyForecast = {
  time: string;
  temp: number;
  rh: number;
  cape: number;
  precipProb: number;
};

export type Forecast = {
  daily: DailyForecast[];
  hourly: HourlyForecast[];
  timezone: string;
};

export async function fetchForecast(p: LatLng): Promise<Forecast> {
  const lat = Math.round(p.latitude * 100) / 100;
  const lon = Math.round(p.longitude * 100) / 100;
  return cached(`fc:${lat}:${lon}`, 2 * HOUR, async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,wind_speed_10m_max,et0_fao_evapotranspiration,weather_code` +
      `&hourly=temperature_2m,relative_humidity_2m,cape,precipitation_probability` +
      `&forecast_days=7&timezone=auto`;
    const j = await getJSON<any>(url);
    const d = j.daily;
    const h = j.hourly;
    return {
      timezone: j.timezone,
      daily: d.time.map((t: string, i: number) => ({
        date: t,
        tmax: d.temperature_2m_max[i] ?? 0,
        tmin: d.temperature_2m_min[i] ?? 0,
        rain: d.precipitation_sum[i] ?? 0,
        rainProb: d.precipitation_probability_max[i] ?? 0,
        gust: d.wind_gusts_10m_max[i] ?? 0,
        wind: d.wind_speed_10m_max[i] ?? 0,
        et0: d.et0_fao_evapotranspiration[i] ?? 0,
        code: d.weather_code[i] ?? 0,
      })),
      hourly: h.time.map((t: string, i: number) => ({
        time: t,
        temp: h.temperature_2m[i] ?? 0,
        rh: h.relative_humidity_2m[i] ?? 0,
        cape: h.cape[i] ?? 0,
        precipProb: h.precipitation_probability[i] ?? 0,
      })),
    };
  });
}

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

/** Steadman / NOAA heat index (°C) from air temp (°C) and RH (%). */
export function heatIndex(tC: number, rh: number): number {
  const t = (tC * 9) / 5 + 32;
  if (t < 80) return tC;
  const hi =
    -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t -
    0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;
  return Math.round((((hi - 32) * 5) / 9) * 10) / 10;
}
