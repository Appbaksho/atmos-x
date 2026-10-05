import { describe, expect, it } from 'vitest';

import { normalFor, summarize, type ArchiveRaw } from './archive';
import { bmdLevel, inBangladesh } from './bmd';
import { heatIndex, heatRisk } from './heat-index';

describe('NOAA heat index', () => {
  it('returns the air temperature below 80 °F', () => {
    expect(heatIndex(25, 90)).toBe(25);
  });
  it('matches NOAA table values', () => {
    // 90 °F / 70 % RH → HI ≈ 105.9 °F ≈ 41.1 °C (NOAA chart: 106 °F)
    expect(heatIndex(32.22, 70)).toBeCloseTo(41.1, 0);
    // 95 °F / 50 % → ≈ 105 °F ≈ 40.6 °C
    expect(heatIndex(35, 50)).toBeCloseTo(40.6, 0);
  });
  it('bands feels-like into risk levels', () => {
    expect(heatRisk(26.9)).toBe('ok');
    expect(heatRisk(27)).toBe('caution');
    expect(heatRisk(32)).toBe('xcaution');
    expect(heatRisk(41)).toBe('danger');
    expect(heatRisk(54)).toBe('xdanger');
  });
});

describe('BMD heat-wave bands', () => {
  it('maps forecast tmax to BMD levels', () => {
    expect(bmdLevel(35.9)).toBeNull();
    expect(bmdLevel(36)).toBe('mild');
    expect(bmdLevel(37.9)).toBe('mild');
    expect(bmdLevel(38)).toBe('moderate');
    expect(bmdLevel(39.9)).toBe('moderate');
    expect(bmdLevel(40)).toBe('severe');
    expect(bmdLevel(41.9)).toBe('severe');
    expect(bmdLevel(42)).toBe('very_severe');
  });
  it('knows where Bangladesh is', () => {
    expect(inBangladesh({ lat: 23.759, lng: 90.359 })).toBe(true); // Dhaka
    expect(inBangladesh({ lat: 22.33, lng: 91.83 })).toBe(true); // Chattogram
    expect(inBangladesh({ lat: 24.9, lng: 91.87 })).toBe(true); // Sylhet
    expect(inBangladesh({ lat: 22.57, lng: 88.36 })).toBe(false); // Kolkata
    expect(inBangladesh({ lat: 25.57, lng: 91.88 })).toBe(false); // Shillong
    expect(inBangladesh({ lat: 51.5, lng: -0.12 })).toBe(false);
  });
});

describe('archive maths', () => {
  const raw: ArchiveRaw = { start: '2020-01-01', end: '2021-12-31', dates: [], tmax: [], tmin: [] };
  for (let y = 2020; y <= 2021; y++) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        raw.dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        const hot = m >= 4 && m <= 6;
        raw.tmax.push((hot ? 35 : 28) + (y - 2020));
        raw.tmin.push(hot ? 26 : 18);
      }
    }
  }
  it('finds the hot season and a yearly history with a trend', () => {
    const s = summarize(raw, 2022);
    expect(s.hot_months).toEqual([4, 5, 6]);
    expect(s.history.map((h) => h.day_lst_c)).toEqual([35, 36]);
    expect(s.trend_c_per_decade).toBeCloseTo(10, 5);
    expect(s.trend_now_c).toBeCloseTo(37, 5);
  });
  it('computes the normal for a date from DOY ±7', () => {
    expect(normalFor(raw, '2026-05-15')).toBeCloseTo(35.5, 5);
    expect(normalFor(raw, '2026-01-10')).toBeCloseTo(28.5, 5);
  });
});
