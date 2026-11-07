/** Farm fields and air sensors (local in v0). Sensor readings are simulated (§4.4). */
import { DataError } from '../errors';
import type { CropId, FarmField, LatLng, Sensor, StageId } from '../types';
import type { DataContext } from './context';
import { assertAccount } from './guest';
import { newId } from './ids';
import { COLL, readList, updateList } from './store';

/* ───────────────────────────── Fields ───────────────────────────── */

export async function listFields(ctx: DataContext): Promise<FarmField[]> {
  if (ctx.kind === 'guest') return [];
  return readList<FarmField>(ctx.ns, COLL.fields);
}

export type FieldInput = { name: string; crop: CropId; stage: StageId; location: LatLng; area?: number | null };

export async function addField(ctx: DataContext, input: FieldInput): Promise<FarmField> {
  assertAccount(ctx.kind, 'fields');
  if (!input.name.trim()) throw new DataError('field.name_required', 'Name the field', 400);
  const f: FarmField = { id: newId('f'), ...input, name: input.name.trim(), area: input.area ?? null, created_at: new Date().toISOString() };
  await updateList<FarmField>(ctx.ns, COLL.fields, (l) => [...l, f]);
  return f;
}

export async function updateField(ctx: DataContext, id: string, patch: Partial<FieldInput>): Promise<void> {
  assertAccount(ctx.kind, 'fields');
  await updateList<FarmField>(ctx.ns, COLL.fields, (l) => l.map((f) => (f.id === id ? { ...f, ...patch } : f)));
}

export async function removeField(ctx: DataContext, id: string): Promise<void> {
  assertAccount(ctx.kind, 'fields');
  await updateList<FarmField>(ctx.ns, COLL.fields, (l) => l.filter((f) => f.id !== id));
}

/* ───────────────────────────── Sensors ───────────────────────────── */

export const SENSOR_INTERVAL_MS = 5 * 60 * 1000;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/**
 * "Simulated device (v0)": the area's live PM2.5 with ±8 % deterministic noise that changes every
 * 5 minutes (stable across renders and reloads within a slot).
 */
export function simulateReading(basePm25: number, sensorId: string, now: number = Date.now()): { pm25: number; last_seen: string } {
  const slot = Math.floor(now / SENSOR_INTERVAL_MS);
  const noise = (hash(`${sensorId}:${slot}`) - 0.5) * 0.16;
  return { pm25: Math.max(0, Math.round(basePm25 * (1 + noise) * 10) / 10), last_seen: new Date(slot * SENSOR_INTERVAL_MS).toISOString() };
}

export async function listSensors(ctx: DataContext, basePm25: number | null, now: number = Date.now()): Promise<Sensor[]> {
  if (ctx.kind === 'guest') return [];
  const list = await readList<Sensor>(ctx.ns, COLL.sensors);
  return list.map((s) =>
    basePm25 === null ? { ...s, simulated: true } : { ...s, ...simulateReading(basePm25, s.id, now), online: true, simulated: true },
  );
}

export type SensorInput = { name: string; location: LatLng | null; model?: string | null };

export async function addSensor(ctx: DataContext, input: SensorInput): Promise<Sensor> {
  assertAccount(ctx.kind, 'sensors');
  if (!input.name.trim()) throw new DataError('sensor.name_required', 'Name the sensor', 400);
  const s: Sensor = {
    id: newId('s'),
    name: input.name.trim(),
    location: input.location,
    model: input.model ?? null,
    pm25: null,
    last_seen: null,
    online: true,
    created_at: new Date().toISOString(),
  };
  await updateList<Sensor>(ctx.ns, COLL.sensors, (l) => [...l, s]);
  return s;
}

export async function removeSensor(ctx: DataContext, id: string): Promise<void> {
  assertAccount(ctx.kind, 'sensors');
  await updateList<Sensor>(ctx.ns, COLL.sensors, (l) => l.filter((s) => s.id !== id));
}
