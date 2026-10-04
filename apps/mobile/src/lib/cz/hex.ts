/**
 * Synthetic H3-style hex heat field, as drawn by the prototype. Scores come from a few gaussian
 * hot/cool spots over a noisy base so the map looks like real urban heat.
 */
export type Spot = [x: number, y: number, width: number, amplitude: number];

export type Hex = { pts: string; s: number; x: number; y: number; hottest: boolean };

export function hexPoints(x: number, y: number, r: number): string {
  const p: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    p.push((x + r * Math.cos(a)).toFixed(1) + ',' + (y + r * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
}

/**
 * Hex cells of size `sz` inside a circle (cx, cy, R) of a w×h canvas.
 * The hottest cell is flagged so it can be outlined.
 */
export function hexGrid(opts: {
  cx: number;
  cy: number;
  R: number;
  sz: number;
  w: number;
  h: number;
  hot: Spot[];
  cool?: Spot[];
  base?: number;
}): Hex[] {
  const { cx, cy, R, sz, w, h, hot, cool = [], base = 48 } = opts;
  const out: Hex[] = [];
  const hw = Math.sqrt(3) * sz;
  let best: Hex | null = null;
  for (let row = -1; row * sz * 1.5 < h + sz; row++) {
    for (let col = -1; col * hw < w + hw; col++) {
      const x = col * hw + (row % 2 ? hw / 2 : 0);
      const y = row * sz * 1.5;
      if (Math.hypot(x - cx, y - cy) > R - sz * 0.4) continue;
      let s = base + 6 * Math.sin(col * 1.7 + row * 0.9);
      hot.forEach(([hx, hy, ww, a]) => (s += a * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * ww * ww))));
      cool.forEach(([hx, hy, ww, a]) => (s -= a * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * ww * ww))));
      s = Math.max(12, Math.min(96, s));
      const cell: Hex = { pts: hexPoints(x, y, sz - 1), s, x, y, hottest: false };
      out.push(cell);
      if (!best || s > best.s) best = cell;
    }
  }
  if (best) best.hottest = true;
  return out;
}
