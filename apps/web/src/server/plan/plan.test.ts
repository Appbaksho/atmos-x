import { describe, expect, it } from 'vitest';

import { roofCoolingC, treeCoolingC, treeRamp } from './coeffs';
import { capacity, feasibility, planMix } from './feasibility';
import { projectLines } from './projection';

describe('tree growth ramp', () => {
  it('is 20 % in year 1, 50 % in year 3, 80 % in year 5, 100 % from year 8', () => {
    expect(treeRamp(0)).toBe(0);
    expect(treeRamp(1)).toBeCloseTo(0.2);
    expect(treeRamp(2)).toBeCloseTo(0.35);
    expect(treeRamp(3)).toBeCloseTo(0.5);
    expect(treeRamp(5)).toBeCloseTo(0.8);
    expect(treeRamp(8)).toBe(1);
    expect(treeRamp(15)).toBe(1);
  });
});

describe('projection', () => {
  it('extends the trend to 2040 and subtracts ramped cooling', () => {
    const p = projectLines({ now_c: 33, per_decade: 0.3 }, 0.2, { trees: 200, roof_m2: 1000, shade: 0 }, 2026, 2040);
    expect(p.years[0]).toBe(2026);
    expect(p.years.at(-1)).toBe(2040);
    expect(p.without_c[0]).toBe(33);
    expect(p.without_c.at(-1)).toBeCloseTo(33 + 0.03 * 14, 2);
    expect(p.with_c[0]).toBe(p.without_c[0]); // nothing planted yet
    const full = 200 * treeCoolingC(0.2) + 1000 * roofCoolingC(0.2);
    expect(p.without_c.at(-1)! - p.with_c.at(-1)!).toBeCloseTo(full, 2);
    // year 1: 20 % of trees + roofs
    expect(p.without_c[1] - p.with_c[1]).toBeCloseTo(0.2 * 200 * treeCoolingC(0.2) + 1000 * roofCoolingC(0.2), 2);
  });
});

describe('plan mix and feasibility', () => {
  it('splits 70/30 and reaches the target', () => {
    const m = planMix(-1.5, 0.2, null);
    expect(m.cooling_c).toBeGreaterThanOrEqual(1.5);
    expect(m.trees * treeCoolingC(0.2)).toBeGreaterThan(m.roof_m2 * roofCoolingC(0.2));
  });
  it('shifts work to roofs when there is no room for trees', () => {
    const space = { ground_m2: 500, roof_m2: 100_000, roadside_m: 0 };
    const m = planMix(-1, 0.2, space);
    expect(m.trees).toBe(capacity(space).trees);
    expect(m.cooling_c).toBeGreaterThanOrEqual(1);
  });
  it('returns yes / stretch / no from space use', () => {
    expect(feasibility(-0.5, 0.2, { ground_m2: 100_000, roof_m2: 100_000, roadside_m: 5000 }, 24).feasible).toBe('yes');
    expect(feasibility(-3, 0.2, { ground_m2: 1000, roof_m2: 1000, roadside_m: 100 }, 24).feasible).toBe('no');
    const f = feasibility(-1, 0.2, null, 3);
    expect(f.notes.map((n) => n.code)).toEqual(expect.arrayContaining(['feas.spots_unknown', 'feas.action_goal']));
  });
});
