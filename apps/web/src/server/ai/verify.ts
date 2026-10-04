import 'server-only';

import { z } from 'zod';

import type { LatLng, VerifyPhotoRequest, VerifyPhotoResult } from '@/lib/data/types';

import { AiUnavailable, imageInput, models, structured } from '../openai';
import { haversineM } from '../util';
import { VERIFY_PROMPT } from './prompts';

/** Photo verification of a logged action (§5.4): AI vision + GPS + time rules. */

export const VERIFY_RULES = { minConfidence: 0.6, maxDistM: 300, maxAgeH: 24, maxFutureMin: 10 } as const;

export const VisionVerdict = z.object({
  matches: z.boolean(),
  confidence: z.number().min(0).max(1),
  seen: z.string(),
  issue: z.enum(['none', 'unclear', 'different_action', 'not_a_photo', 'nothing_relevant']),
});
export type VisionVerdict = z.infer<typeof VisionVerdict>;

/**
 * Pure decision (unit-tested). Verified only when: the AI says it matches with confidence ≥ 0.6,
 * GPS is within 300 m of the target zone (or, with no target, a location is provided), and the
 * photo was taken within the last 24 h. Otherwise pending ("a teammate can confirm it").
 */
export function decideVerification(
  ai: VisionVerdict | null,
  where: { lat: number | null; lng: number | null; target: LatLng | null },
  takenAt: string,
  now = Date.now(),
): Omit<VerifyPhotoResult, 'seen'> & { seen: string } {
  const confidence = ai ? Math.round(ai.confidence * 100) / 100 : 0;
  const seen = ai?.seen ?? '';
  const pending = (reason_code: string) => ({ status: 'pending' as const, confidence, seen, reason_code });
  if (!ai) return pending('ai_unavailable');
  if (!ai.matches) return pending(ai.issue === 'not_a_photo' ? 'not_a_photo' : ai.issue === 'different_action' ? 'different_action' : 'ai_mismatch');
  if (ai.confidence < VERIFY_RULES.minConfidence) return pending('ai_low_confidence');
  if (where.lat == null || where.lng == null) return pending('gps_missing');
  if (where.target && haversineM({ lat: where.lat, lng: where.lng }, where.target) > VERIFY_RULES.maxDistM) return pending('gps_far');
  const t = Date.parse(takenAt);
  if (!Number.isFinite(t)) return pending('time_unknown');
  if (t > now + VERIFY_RULES.maxFutureMin * 60_000) return pending('time_future');
  if (now - t > VERIFY_RULES.maxAgeH * 3600_000) return pending('too_old');
  return { status: 'verified', confidence, seen, reason_code: 'ok' };
}

const ACTION_DESC: Record<VerifyPhotoRequest['action_type'], string> = {
  plant_tree: 'planting a tree (a sapling or young tree in the ground)',
  plant_shrubs: 'planting shrubs or potted plants',
  rooftop_garden: 'a rooftop garden (plants growing on a roof)',
  cool_roof: 'a cool / white / reflective roof coating',
  green_wall: 'a green wall or creepers on a wall',
  shade_structure: 'a shade structure (shade sail, canopy, awning)',
  water_tree: 'watering or caring for a young tree',
  awareness: 'an awareness event (people gathered, a talk, posters)',
};

export async function visionCheck(req: VerifyPhotoRequest): Promise<VisionVerdict | null> {
  try {
    return await structured({
      schema: VisionVerdict,
      name: 'photo_verdict',
      model: models.main,
      instructions: VERIFY_PROMPT(req.lang),
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `Claimed action: ${ACTION_DESC[req.action_type]} (action_type ${req.action_type}), quantity ${req.quantity}.` },
            imageInput(req.image, 'low'),
          ],
        },
      ],
      label: 'verify',
      maxOutputTokens: 1500,
      timeoutMs: 30_000,
    });
  } catch (e) {
    // Any AI failure (cap, timeout, bad output) → no verdict → pending.
    if (!(e instanceof AiUnavailable)) console.warn('[atmos] verify-photo vision failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function verifyPhoto(req: VerifyPhotoRequest): Promise<VerifyPhotoResult> {
  const ai = await visionCheck(req);
  return decideVerification(ai, { lat: req.lat, lng: req.lng, target: req.target }, req.taken_at);
}
