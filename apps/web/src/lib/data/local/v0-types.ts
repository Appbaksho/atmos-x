/**
 * V0 device shapes (IndexedDB) for actions, trees and the old AI checks. V1 screens use the server
 * shapes in ../types; these remain only for the device import (A9) and the local modules that later
 * V1 stages remove.
 */
import type { ActionTypeId, Badge, LatLng, Level, Locale, Meta, TreeHealth, VerificationStatus } from '../types';

export type VerifyPhotoRequest = {
  /** data URL, ≤ 768 px */
  image: string;
  action_type: ActionTypeId;
  quantity: number;
  taken_at: string;
  lat: number | null;
  lng: number | null;
  target: LatLng | null;
  lang: Locale;
};

export type VerifyPhotoResult = {
  status: 'verified' | 'pending';
  confidence: number;
  seen: string;
  reason_code: string;
  meta?: Meta;
};

export type ActionLog = {
  id: string;
  action_type: ActionTypeId;
  quantity: number;
  points: number;
  cooling_c: number;
  trees: number;
  status: VerificationStatus;
  photo_url: string | null;
  lat: number | null;
  lng: number | null;
  taken_at: string | null;
  goal_id: string | null;
  team_id: string | null;
  zone_label: string | null;
  note: string | null;
  verification?: VerifyPhotoResult | null;
  created_at: string;
};

export type LogActionInput = {
  action_type: ActionTypeId;
  quantity: number;
  lat: number | null;
  lng: number | null;
  taken_at: string;
  photo: Blob | null;
  goal_id?: string | null;
  team_id?: string | null;
  note?: string | null;
};

export type TreeStatus = 'ok' | 'due' | 'overdue';
export type TreeCheckRequest = { image: string; species_id: string; lang: Locale };
export type TreeCheckResult = { health: TreeHealth; confidence: number; tip: string; seen: string; meta?: Meta };

export type TreeCheck = {
  id: string;
  tree_id: string;
  photo_url: string | null;
  health: TreeHealth;
  note: string | null;
  ai?: TreeCheckResult | null;
  points: number;
  created_at: string;
};

export type Tree = {
  id: string;
  species_id: string;
  nickname: string;
  planted_at: string;
  location: LatLng | null;
  last_check_at: string | null;
  next_due_at: string;
  status: TreeStatus;
  health: TreeHealth;
  photo_url: string | null;
  checks?: TreeCheck[];
};

export type MyStats = {
  points: number;
  provisional_points: number;
  level: Level;
  badges: Badge[];
  trees: number;
  actions: number;
  cooling_c: number;
  rank_area?: number | null;
};
