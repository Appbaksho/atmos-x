/**
 * Farmer-mode constants shared by F01 Farmer home, F02 Alert detail and F03 My fields (V0-7).
 * Visual constants only (icons, colours, the hero photo). All numbers on screen come from hooks.
 */
import { B } from '@/components/cz/tokens';
import type { AlertLevel, CropId, FarmAlert, FarmField, Hazard, LatLng, StageId } from '@/lib/data/types';

export const CROP_IDS: CropId[] = ['boro', 'aman', 'aus', 'potato', 'wheat', 'jute', 'vegetables', 'maize'];
export const STAGE_IDS: StageId[] = ['seedbed', 'vegetative', 'flowering', 'ripening', 'harvest'];

/** Default crop and stage for guests previewing alerts (the demo story's Boro field). */
export const PREVIEW_CROP: CropId = 'boro';
export const PREVIEW_STAGE: StageId = 'flowering';

/** Rice field hero (Unsplash, credited via the alt text as in the prototype). */
export const FIELD_PHOTO = 'https://images.unsplash.com/photo-1684691583342-0dfafc6942cf?auto=format&fit=crop&w=900&h=900&q=70';
export const FIELD_PHOTO_CREDIT = 'Photo by Kabiur Rahman Riyad on Unsplash';
export const EDGE_PHOTO =
  'https://images.unsplash.com/photo-1663074898186-21b020623d09?auto=format&fit=crop&w=240&h=240&q=70&crop=focalpoint&fp-x=.7&fp-y=.55&fp-z=2';

/** Farm heat colour by air temperature (°C): the prototype's farm-specific scale. */
export function farmHeat(c: number): string {
  return c < 30 ? B.green : c < 33 ? B.yellow : c < 35 ? B.orange : c < 37 ? B.red : B.deepRed;
}

/** Field-specific stroke icons (24×24) ported from screens/farm/farm-data.ts. */
export const TI = {
  drop: 'M12 3.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z',
  leaf: 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7',
  tree: 'M12 21v-5M12 3l6 9h-3l4 4H5l4-4H6z',
  bug: 'M9 7a3 3 0 0 1 6 0M8 9h8v6a4 4 0 0 1-8 0zM4 11h4M16 11h4M4 17h4M16 17h4M12 9v10',
  channel: 'M3 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 14c3 0 3 2 6 2s3-2 6-2 3 2 6 2',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2',
  plant: 'M12 21V10M12 10c0-3 2-5 5-5 0 3-2 5-5 5zM12 14c0-2.5-2-4.5-5-4.5 0 2.5 2 4.5 5 4.5zM4 21h16',
  calendar: 'M4 7h16v13H4zM4 11h16M8 4v4M16 4v4',
  cold: 'M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2',
  storm: 'M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3 3 0 0 1 0 6zM11 15l-2 4h3l-2 4',
  rain: 'M7 14a4 4 0 1 1 1-7.9A5 5 0 0 1 18 8a3 3 0 0 1 0 6zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
} as const;

export const HAZARD_ICON: Record<Hazard, string> = {
  flood: TI.channel,
  heat: TI.sun,
  drought: TI.drop,
  cold: TI.cold,
  lightning: TI.bolt,
  rain: TI.rain,
  storm: TI.storm,
  disease: TI.bug,
};

const LEVEL_RANK: Record<AlertLevel, number> = { danger: 3, warning: 2, watch: 1, info: 0 };

/** Background / foreground per alert level (danger = deep red, warning = red, watch = orange). */
export function levelColors(level: AlertLevel): { bg: string; fg: string; soft: string } {
  switch (level) {
    case 'danger':
      return { bg: B.deepRed, fg: B.white, soft: 'rgba(163,36,43,0.14)' };
    case 'warning':
      return { bg: B.red, fg: B.white, soft: 'rgba(229,83,61,0.12)' };
    case 'watch':
      return { bg: B.orange, fg: B.navy, soft: 'rgba(242,154,56,0.18)' };
    default:
      return { bg: B.blue, fg: B.white, soft: 'rgba(1,63,246,0.10)' };
  }
}

/** Most severe first, then soonest. */
export function sortAlerts(alerts: readonly FarmAlert[]): FarmAlert[] {
  return [...alerts].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.window.from.localeCompare(b.window.from));
}

/** Input for useFarmAlerts from a saved field, or the guest preview at the focus point. */
export function alertsInput(field: Pick<FarmField, 'id' | 'crop' | 'stage' | 'location'> | null, focus: LatLng | null) {
  if (field) return { location: field.location, crop: field.crop, stage: field.stage, field_id: field.id };
  if (!focus) return null;
  return { location: focus, crop: PREVIEW_CROP, stage: PREVIEW_STAGE };
}

/** Days from today (local) until an ISO date (yyyy-mm-dd); 0 when it is today or past. */
export function daysUntil(isoDate: string, now = new Date()): number {
  const d = new Date(isoDate.length <= 10 ? isoDate + 'T00:00:00' : isoDate);
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((d.getTime() - t0) / 864e5));
}
