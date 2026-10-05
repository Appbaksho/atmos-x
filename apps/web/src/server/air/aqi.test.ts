import { describe, expect, it } from 'vitest';

import { airAdvice, aqiCategory, aqiPm10, aqiPm25 } from './aqi';

describe('US EPA 2024 PM2.5 AQI', () => {
  it('uses the 2024 breakpoints', () => {
    expect(aqiPm25(0)).toBe(0);
    expect(aqiPm25(9.0)).toBe(50);
    expect(aqiPm25(9.1)).toBe(51);
    expect(aqiPm25(35.4)).toBe(100);
    expect(aqiPm25(35.5)).toBe(101);
    expect(aqiPm25(55.4)).toBe(150);
    expect(aqiPm25(55.5)).toBe(151);
    expect(aqiPm25(125.4)).toBe(200);
    expect(aqiPm25(125.5)).toBe(201);
    expect(aqiPm25(225.4)).toBe(300);
    expect(aqiPm25(225.5)).toBe(301);
    expect(aqiPm25(400)).toBe(500);
  });
  it('truncates to 0.1 µg/m³ before interpolating', () => {
    expect(aqiPm25(9.09)).toBe(50);
    expect(aqiPm25(20)).toBe(Math.round(((100 - 51) / (35.4 - 9.1)) * (20 - 9.1) + 51));
  });
  it('computes PM10 AQI', () => {
    expect(aqiPm10(54)).toBe(50);
    expect(aqiPm10(154)).toBe(100);
  });
  it('maps AQI to categories and advice codes', () => {
    expect(aqiCategory(50)).toBe('good');
    expect(aqiCategory(51)).toBe('moderate');
    expect(aqiCategory(101)).toBe('usg');
    expect(aqiCategory(151)).toBe('unhealthy');
    expect(aqiCategory(201)).toBe('very_unhealthy');
    expect(aqiCategory(301)).toBe('hazardous');
    expect(airAdvice('unhealthy').map((a) => a.code)).toContain('advice.air.mask_n95');
  });
});
