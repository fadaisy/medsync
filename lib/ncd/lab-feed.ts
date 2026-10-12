/**
 * The NCD visit's lab fields, read from released results (Lab Phase 2 §6.14, rules NF-1 to NF-7; D-LAB2-14,
 * -15; ADR 0259). Pure.
 *
 * Each field is a signed mapping (concept, unit, accepted methods, look-back window); there are no defaults
 * in code (NF-1). The latest released, current-version result inside the window that matches all three
 * fills the field (NF-2); a result in another unit is listed, never used and never dropped. An outside result
 * keeps what was printed and is converted only by the concept's plain factor (NF-7, D-LAB2-15).
 */
import type { Payload } from "@/lib/lab/signed-config";

export interface FeedResult {
  reportId: string;
  version: number;
  observationId: string;
  conceptId: string;
  value: string;
  unit: string;
  method: "lab" | "bedside";
  released: boolean;
  /** A newer version of the same report exists: this one is not current. */
  superseded: boolean;
  restricted: boolean;
  /** The lab-only rows of an analyser profile never reach the feed (AP-6). */
  labOnly: boolean;
  releasedAt: Date;
  amended: boolean;
}

export type FieldValue =
  | { kind: "filled"; result: FeedResult; previous: FeedResult | null }
  | {
      kind: "none";
      reason:
        | "none_in_window"
        | "unit_differs"
        | "method_not_accepted"
        | "restricted"
        | "not_mapped";
      unusable: FeedResult[];
    };

/** NF-2, NF-3: a read over live rows; an amended result simply becomes the newest current one. */
export function latestForField(
  mapping: Payload<"ncd_mapping"> | null,
  results: readonly FeedResult[],
  at: Date,
): FieldValue {
  if (!mapping) return { kind: "none", reason: "not_mapped", unusable: [] };
  const since = at.getTime() - mapping.windowDays * 86_400_000;
  const candidates = results
    .filter(
      (r) =>
        r.conceptId === mapping.concept &&
        r.released &&
        !r.superseded &&
        !r.labOnly &&
        r.releasedAt.getTime() >= since &&
        r.releasedAt.getTime() <= at.getTime(),
    )
    .sort((a, b) => b.releasedAt.getTime() - a.releasedAt.getTime());
  const usable = candidates.filter(
    (r) => r.unit === mapping.unit && mapping.methods.includes(r.method) && !r.restricted,
  );
  if (usable[0]) return { kind: "filled", result: usable[0], previous: usable[1] ?? null };
  const unusable = candidates.filter((r) => r.unit !== mapping.unit);
  const reason = !candidates.length
    ? "none_in_window"
    : unusable.length
      ? "unit_differs"
      : candidates.every((r) => r.restricted)
        ? "restricted"
        : "method_not_accepted";
  return { kind: "none", reason, unusable };
}

/** NF-7: the canonical value of an outside result, by the concept's plain factor only (canonical × factor
 *  = other, so other ÷ factor = canonical). Null when the unit has no plain factor. */
export function outsideCanonical(
  value: number,
  unit: string,
  canonicalUnit: string,
  otherUnits: readonly { unit: string; multiplyBy?: number }[],
): number | null {
  if (unit === canonicalUnit) return value;
  const f = otherUnits.find((u) => u.unit === unit)?.multiplyBy;
  return f ? value / f : null;
}
