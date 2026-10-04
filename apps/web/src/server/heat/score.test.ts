import { latLngToCell, gridDisk } from 'h3-js';
import { describe, expect, it } from 'vitest';

import { clusterHotCells, estSurfaceC, heatScore, isNight, landCoverTerm, nearTies, scoreCells, whatIfGreen } from './score';

const lc = (built: number, road: number, green: number, water = 0, density = 0) => ({ built, road, green, water, density });

describe('§5.1 estimated surface temperature', () => {
  it('applies the documented coefficients', () => {
    // 30 + 9·0.5 + 7·0.2 − 6·0.1 − 8·0 + 1.5·min(20/40,1) = 30 + 4.5 + 1.4 − 0.6 + 0.75
    expect(estSurfaceC(30, lc(0.5, 0.2, 0.1, 0, 20), false)).toBeCloseTo(36.05, 6);
    // density term caps at 1
    expect(landCoverTerm(lc(0, 0, 0, 0, 400), false)).toBeCloseTo(1.5, 6);
  });
  it('scales land-cover terms by 0.4 at night (19:00–06:00)', () => {
    expect(isNight(19)).toBe(true);
    expect(isNight(2)).toBe(true);
    expect(isNight(6)).toBe(false);
    expect(isNight(14)).toBe(false);
    expect(landCoverTerm(lc(0.5, 0.2, 0.1, 0, 20), true)).toBeCloseTo(0.4 * 6.05, 6);
  });
});

describe('Heat Score', () => {
  it('is 10 + 85·sealed − 50·green − 60·water + 6·density + 4·Δ, clamped and rounded', () => {
    expect(heatScore(30, 30, lc(0, 0, 0))).toBe(10);
    // sealed 0.7, green 0.1, density 0 (lc helper), Δ = +2 °C
    expect(heatScore(32, 30, lc(0.5, 0.2, 0.1))).toBe(Math.round(10 + 85 * 0.7 - 50 * 0.1 + 4 * 2));
    expect(heatScore(60, 30, lc(1, 0, 0))).toBe(100);
    expect(heatScore(10, 30, lc(0, 0, 1))).toBe(0);
  });
  it('scores cells against the scan median', () => {
    const cells = [
      { h3: 'a', ...lc(0.8, 0.1, 0) },
      { h3: 'b', ...lc(0.4, 0.1, 0.2) },
      { h3: 'c', ...lc(0.1, 0.05, 0.7) },
    ];
    const r = scoreCells(cells, 30, false);
    expect(r.median_est_c).toBeCloseTo(estSurfaceC(30, cells[1], false), 2);
    expect(r.cells[0].score).toBeGreaterThan(r.cells[1].score);
    expect(r.cells[1].score).toBeGreaterThan(r.cells[2].score);
  });
  it('what-if +10 % green lowers the temperature by 0.6 °C (day)', () => {
    const w = whatIfGreen(lc(0.6, 0.2, 0.05), 30, 33, false);
    expect(w.lst_drop_c).toBeCloseTo(0.6, 6);
    expect(w.score_after).toBeLessThan(heatScore(estSurfaceC(30, lc(0.6, 0.2, 0.05), false), 33, lc(0.6, 0.2, 0.05)));
  });
});

describe('zones', () => {
  it('clusters top-quartile cells by H3 adjacency and ranks by mean score', () => {
    const c0 = latLngToCell(23.759, 90.359, 10);
    const ring = gridDisk(c0, 3);
    const hotA = new Set(gridDisk(c0, 1));
    const far = ring.find((h) => !gridDisk(c0, 2).includes(h)) as string;
    const cells = ring.map((h) => ({ h3: h, built: 0, road: 0, green: 0, water: 0, density: 0, est_c: 30, score: hotA.has(h) ? 90 : h === far ? 85 : 40 }));
    const zs = clusterHotCells(cells);
    expect(zs.length).toBe(2);
    expect(zs[0].cells.length).toBe(7);
    expect(zs[0].score).toBe(90);
    expect(zs[1].cells.map((c) => c.h3)).toEqual([far]);
  });
  it('flags near-ties within ±3', () => {
    expect(nearTies([90, 88, 80, 70])).toEqual([true, true, false, false]);
  });
});
