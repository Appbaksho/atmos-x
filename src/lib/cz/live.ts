/**
 * Live "conditions now" for Home: Open-Meteo hourly temperature + humidity at the focus point,
 * NOAA heat index for feels-like, and the reverse-geocoded place name. Falls back to the demo
 * story (Mohammadpur, 34° / feels 41°) while loading or offline, and says which one it is.
 */
import { useEffect, useState } from 'react';

import { useLocation } from '@/context/location';
import { fetchForecast, heatIndex } from '@/lib/weather';
import { MY_ZONE } from './demo';

export type Conditions = {
  air: number;
  feels: number;
  humidity: number;
  wind: number;
  /** "14:00" — time of the reading */
  time: string;
  place: string;
  live: boolean;
};

const DEMO: Conditions = { air: MY_ZONE.air, feels: MY_ZONE.feels, humidity: MY_ZONE.humidity, wind: MY_ZONE.wind, time: '14:00', place: 'Mohammadpur, Dhaka', live: false };

/** NOAA heat-index risk band for a feels-like temperature (°C). */
export function heatRisk(feelsC: number): { key: 'ok' | 'caution' | 'xcaution' | 'danger' | 'xdanger'; color: string; fg: string } {
  if (feelsC >= 54) return { key: 'xdanger', color: '#A3242B', fg: '#FFFFFF' };
  if (feelsC >= 41) return { key: 'danger', color: '#E5533D', fg: '#FFFFFF' };
  if (feelsC >= 32) return { key: 'xcaution', color: '#F29A38', fg: '#00182E' };
  if (feelsC >= 27) return { key: 'caution', color: '#F2D04B', fg: '#00182E' };
  return { key: 'ok', color: '#4CAF50', fg: '#00182E' };
}

export function useConditions(): Conditions {
  const { focus, placeName, permission } = useLocation();
  const [c, setC] = useState<Conditions>(DEMO);

  useEffect(() => {
    if (permission !== 'granted') return;
    let alive = true;
    fetchForecast(focus)
      .then((fc) => {
        if (!alive || !fc.hourly.length) return;
        const now = Date.now();
        let best = fc.hourly[0];
        for (const h of fc.hourly) if (Math.abs(new Date(h.time).getTime() - now) < Math.abs(new Date(best.time).getTime() - now)) best = h;
        setC({
          air: Math.round(best.temp),
          feels: Math.round(heatIndex(best.temp, best.rh)),
          humidity: Math.round(best.rh),
          wind: Math.round(fc.daily[0]?.wind ?? DEMO.wind),
          time: best.time.slice(11, 16),
          place: placeName ?? DEMO.place,
          live: true,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [focus, placeName, permission]);

  return c;
}
