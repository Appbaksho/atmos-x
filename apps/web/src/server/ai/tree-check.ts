import 'server-only';

import { z } from 'zod';

import type { TreeCheckRequest, TreeCheckResult } from '@/lib/data/local/v0-types';

import { imageInput, models, structured } from '../openai';
import { curatedDetail } from '../plan/species';
import { TREE_CHECK_PROMPT } from './prompts';

const Verdict = z.object({
  health: z.enum(['healthy', 'stressed', 'dead']),
  confidence: z.number().min(0).max(1),
  seen: z.string(),
  tip: z.string(),
});

/** Tree health from a photo (vision): healthy / stressed / dead + one tip. Throws AiUnavailable on failure. */
export async function treeCheck(req: TreeCheckRequest): Promise<TreeCheckResult> {
  const sp = curatedDetail(req.species_id, 'en');
  const v = await structured({
    schema: Verdict,
    name: 'tree_health',
    model: models.main,
    instructions: TREE_CHECK_PROMPT(req.lang),
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Species: ${sp ? `${sp.name} (${sp.scientific})` : req.species_id}. Judge this tree's health.` },
          imageInput(req.image, 'auto'),
        ],
      },
    ],
    label: 'tree-check',
    maxOutputTokens: 1500,
    timeoutMs: 30_000,
  });
  return { health: v.health, confidence: Math.round(v.confidence * 100) / 100, seen: v.seen, tip: v.tip };
}
