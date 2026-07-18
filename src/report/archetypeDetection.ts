// src/report/archetypeDetection.ts
import type { WclEvent } from "../wcl/events";

export type TalentBucket =
  | "deep-resto"
  | "likely-dreamstate-full"
  | "likely-dreamstate-partial"
  | "mostly-resto"
  | "mostly-balance"
  | "restokin-shaped"
  | "other-unclassified"
  | "unknown-no-talent-data";

// Sourced from TBC's universal 5-points-per-talent-tier rule (tier N
// unlocks at 5*(N-1) points spent, uniform across every class/tree) applied
// to Nature's Swiftness's tier-5 placement — cross-validated against this
// file's own already-verified figures: Swiftmend (tier 7 -> 30 points) and
// Tree of Life (tier 9 -> 40 points to unlock the tier + 1 spent on the
// capstone itself = 41) both match this repo's existing, live-data-confirmed
// thresholds exactly (see docs/backlog.md).
export const NATURES_SWIFTNESS_MIN_RESTORATION = 20;
export const SWIFTMEND_MIN_RESTORATION = 30;

// Order matters: deep-resto and the two dreamstate tiers are specific
// signatures checked first; "mostly-resto" vs "mostly-balance" is a
// same-priority fallback comparison between whichever tree actually has
// more points, not two independent thresholds — a 21/0/40 split has to land
// in "mostly-resto" (resto dominates) even though balance alone is >= 20.
// Feral is checked too: a 0/46/15 split isn't "mostly-resto" just because
// restoration > balance — Feral dominates both, so it falls through to
// "other-unclassified" (not a target archetype for this app at all) rather
// than being mislabeled as leaning Restoration.
export function classifyBucket(
  balance: number,
  feral: number,
  restoration: number,
): TalentBucket {
  if (restoration >= 41) return "deep-resto";
  if (balance >= 33) return "likely-dreamstate-full";
  if (balance >= 31) return "likely-dreamstate-partial";
  if (restoration > balance && restoration > feral) return "mostly-resto";
  if (balance >= 20 && balance > feral) return "mostly-balance";
  return "other-unclassified";
}

export const BUCKET_DEFINITIONS: Record<TalentBucket, string> = {
  "deep-resto": "Restoration >= 41 (Tree of Life-eligible)",
  "likely-dreamstate-full": "Balance >= 33 (full 3/3 Dreamstate-eligible)",
  "likely-dreamstate-partial": "Balance >= 31 (>=1 point Dreamstate-eligible)",
  "mostly-resto":
    "Restoration > Balance, but below deep-resto's 41-point cutoff and below Dreamstate's 31-point Balance threshold",
  "mostly-balance": "Balance >= Restoration and Balance >= 20",
  "restokin-shaped": "signature not yet determined — see story 900",
  "other-unclassified": "doesn't fit any bucket above",
  "unknown-no-talent-data": "talent read failed or unavailable",
};

// Story 903d: buckets the onboarding notice calls out as not well-supported —
// Regrowth-spec resto, Balance-as-healer, and the unclassified catch-all.
// Dreamstate stays unflagged per docs/backlog.md 903d ("supported to a lesser
// extent"), even though it's talent-indistinguishable from Restokin (see this
// file's restokin-shaped comment above and docs/backlog.md line 475).
export const UNSUPPORTED_ARCHETYPE_BUCKETS: ReadonlySet<TalentBucket> = new Set(
  ["mostly-resto", "mostly-balance", "other-unclassified", "restokin-shaped"],
);

interface CombatantTalentEntry {
  id: number;
}

// Mirrors computePrepHygiene's (src/metrics/prepHygiene.ts) established
// pattern for reading an untyped CombatantInfo field off WclEvent: find the
// matching druid by sourceID, then narrow the field with Array.isArray
// before casting, rather than trusting the index signature blindly.
export function parseTalentPoints(
  combatantInfoEvents: WclEvent[],
  druidId: number,
): [number, number, number] | null {
  const combatant = combatantInfoEvents.find(
    (event) => event.sourceID === druidId,
  );
  const rawTalents = combatant?.talents;
  const talents = Array.isArray(rawTalents)
    ? (rawTalents as CombatantTalentEntry[])
    : [];
  if (talents.length !== 3) return null;
  const [balance, feral, restoration] = talents.map((t) => t.id);
  return [balance, feral, restoration];
}
