import { LatLng, haversineKm } from './geo';
import { LstCell, LstGrid } from './nasa';
import { ROOF_COOLING_PER_KM2, TREE_COOLING_PER_KM2 } from './actions';

export type AnalyzedCell = LstCell & { anomaly: number | null };

export type HeatZone = {
  id: string;
  rank: number;
  center: LatLng;
  peakLst: number;
  meanLst: number;
  /** Mean °C above the neighbourhood median */
  anomaly: number;
  peakAnomaly: number;
  areaKm2: number;
  distanceKm: number;
  severity: 'extreme' | 'high' | 'moderate';
  cells: { row: number; col: number }[];
};

export type HeatAnalysis = {
  cells: AnalyzedCell[];
  baseline: number; // neighbourhood median LST
  minLst: number;
  maxLst: number;
  meanLst: number;
  zones: HeatZone[];
};

const HOT_THRESHOLD = 1.0; // °C above the median to count as a hot cell

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function analyzeGrid(grid: LstGrid, user: LatLng): HeatAnalysis {
  const vals = grid.cells.map((c) => c.lst).filter((v): v is number => v != null);
  if (!vals.length) {
    return { cells: grid.cells.map((c) => ({ ...c, anomaly: null })), baseline: 0, minLst: 0, maxLst: 0, meanLst: 0, zones: [] };
  }
  const baseline = median(vals);
  const cells: AnalyzedCell[] = grid.cells.map((c) => ({
    ...c,
    anomaly: c.lst == null ? null : Math.round((c.lst - baseline) * 10) / 10,
  }));

  // Connected components (8-neighbour) of hot cells -> heat zones.
  const idx = (r: number, c: number) => r * grid.ncols + c;
  const seen = new Set<number>();
  const zones: HeatZone[] = [];
  for (const cell of cells) {
    const i = idx(cell.row, cell.col);
    if (seen.has(i) || cell.anomaly == null || cell.anomaly < HOT_THRESHOLD) continue;
    const stack = [cell];
    const members: AnalyzedCell[] = [];
    seen.add(i);
    while (stack.length) {
      const cur = stack.pop()!;
      members.push(cur);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const r = cur.row + dr;
          const c = cur.col + dc;
          if (r < 0 || c < 0 || r >= grid.nrows || c >= grid.ncols) continue;
          const j = idx(r, c);
          const n = cells[j];
          if (!seen.has(j) && n.anomaly != null && n.anomaly >= HOT_THRESHOLD) {
            seen.add(j);
            stack.push(n);
          }
        }
      }
    }
    const lsts = members.map((m) => m.lst!);
    const anoms = members.map((m) => m.anomaly!);
    // weight centre by anomaly
    const wsum = anoms.reduce((a, b) => a + b, 0);
    const center = {
      latitude: members.reduce((a, m) => a + m.center.latitude * m.anomaly!, 0) / wsum,
      longitude: members.reduce((a, m) => a + m.center.longitude * m.anomaly!, 0) / wsum,
    };
    const anomaly = wsum / members.length;
    const peakAnomaly = Math.max(...anoms);
    zones.push({
      id: `${grid.center.latitude},${grid.center.longitude},${grid.radiusKm}:${members[0].row}-${members[0].col}`,
      rank: 0,
      center,
      peakLst: Math.max(...lsts),
      meanLst: Math.round((lsts.reduce((a, b) => a + b, 0) / lsts.length) * 10) / 10,
      anomaly: Math.round(anomaly * 10) / 10,
      peakAnomaly: Math.round(peakAnomaly * 10) / 10,
      areaKm2: Math.round(members.length * grid.cellKm * grid.cellKm * 10) / 10,
      distanceKm: haversineKm(user, center),
      severity: peakAnomaly >= 4 ? 'extreme' : peakAnomaly >= 2.5 ? 'high' : 'moderate',
      cells: members.map((m) => ({ row: m.row, col: m.col })),
    });
  }

  zones.sort((a, b) => b.anomaly * Math.sqrt(b.areaKm2) - a.anomaly * Math.sqrt(a.areaKm2));
  zones.forEach((z, i) => (z.rank = i + 1));

  return {
    cells,
    baseline: Math.round(baseline * 10) / 10,
    minLst: Math.min(...vals),
    maxLst: Math.max(...vals),
    meanLst: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    zones: zones.slice(0, 8),
  };
}

export type ActionPlan = {
  targetCooling: number;
  treesNeeded: number;
  roofsM2: number;
  mixTrees: number;
  mixRoofM2: number;
  steps: { title: string; detail: string }[];
};

/**
 * Turn a zone's anomaly into a concrete plan. We aim to bring the zone back to
 * the neighbourhood median (or a user goal), split 70/30 between trees and cool roofs.
 */
export function planForZone(zone: Pick<HeatZone, 'anomaly' | 'areaKm2'>, goalC?: number): ActionPlan {
  const target = Math.max(0.2, Math.round((goalC ?? zone.anomaly) * 10) / 10);
  const area = Math.max(1, zone.areaKm2);
  const treesNeeded = Math.ceil((target / TREE_COOLING_PER_KM2) * area);
  const roofsM2 = Math.ceil((target / ROOF_COOLING_PER_KM2) * area) * 10;
  const mixTrees = Math.ceil(treesNeeded * 0.7);
  const mixRoofM2 = Math.ceil((roofsM2 * 0.3) / 10) * 10;
  return {
    targetCooling: target,
    treesNeeded,
    roofsM2,
    mixTrees,
    mixRoofM2,
    steps: [
      {
        title: 'Map the bare spots',
        detail: 'Walk the zone and note roadsides, school yards, mosque and temple grounds, and vacant plots without shade.',
      },
      {
        title: `Plant ~${mixTrees.toLocaleString()} shade trees`,
        detail: 'Prioritise native, broad-canopy species. Plant at the start of the monsoon for best survival.',
      },
      {
        title: `Coat ~${mixRoofM2.toLocaleString()} m² of roofs white`,
        detail: 'Lime wash or reflective paint on tin and concrete roofs. Quick win before summer peaks.',
      },
      {
        title: 'Recruit a clan',
        detail: 'Invite neighbours, your school or office. Every logged action counts toward the shared goal.',
      },
      {
        title: 'Care for 2 years',
        detail: 'Water saplings weekly in the dry season and log care sessions so survival stays high.',
      },
    ],
  };
}
