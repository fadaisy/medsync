import type { FindingRef } from "../impression/facts";
import type { SummaryView } from "./compose";

/**
 * The summary review (SI8, §5.1 "Review"): "Mark as reviewed" stores the actor, the time, a hash
 * of the composed inputs and a snapshot; any later change to those inputs makes the status
 * "Changed since review" and lists what changed (Added, Left out, Edited). Pure.
 */

export type SummaryMode = "composed" | "words";

export interface SummarySnapshot {
  items: { ref: FindingRef; text: string; included: boolean }[];
  syndrome: string;
  mode: SummaryMode;
  words: string;
  text: string;
}

export interface SummaryReview {
  by: string;
  at: string;
  inputsHash: string;
  snapshot: SummarySnapshot;
}

/** The draft's `summary` section (§8). */
export interface SummaryDraft {
  mode: SummaryMode;
  words?: string;
  syndrome?: string;
  include?: Record<FindingRef, boolean>;
  review?: SummaryReview;
  /** Written at signing only (D-SI-20). */
  text?: string;
}

export function snapshotOf(view: SummaryView, d: SummaryDraft): SummarySnapshot {
  return {
    items: view.items.map((f) => ({ ref: f.ref, text: f.text, included: f.included })),
    syndrome: (d.syndrome ?? "").trim(),
    mode: d.mode,
    words: d.mode === "words" ? (d.words ?? "") : "",
    text: view.text,
  };
}

/** cyrb53: a small, stable, synchronous string hash (not a security primitive; it only detects
 *  change). */
export function hashString(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** The hash covers the inclusion flags, the syndrome, the mode, the typed words and the composed
 *  text (§5.1). */
export const inputsHash = (s: SummarySnapshot) =>
  hashString(
    JSON.stringify([
      s.items.filter((i) => i.included).map((i) => [i.ref, i.text]),
      s.syndrome,
      s.mode,
      s.words,
      s.text,
    ]),
  );

export type ReviewStatus = "not_reviewed" | "reviewed" | "changed";

export function reviewStatus(d: SummaryDraft, now: SummarySnapshot): ReviewStatus {
  if (!d.review) return "not_reviewed";
  return d.review.inputsHash === inputsHash(now) ? "reviewed" : "changed";
}

export interface Change {
  kind: "added" | "left_out" | "edited";
  text: string;
}

/** What changed since the review: exact, in the current order. */
export function diff(then: SummarySnapshot, now: SummarySnapshot): Change[] {
  const out: Change[] = [];
  const before = new Map(then.items.map((i) => [i.ref, i]));
  const after = new Map(now.items.map((i) => [i.ref, i]));
  if (then.syndrome !== now.syndrome)
    out.push({ kind: "edited", text: `Syndrome: ${now.syndrome || "(removed)"}` });
  if (then.mode !== now.mode)
    out.push({
      kind: "edited",
      text: now.mode === "words" ? "Now in your words" : "Back to composed",
    });
  else if (now.mode === "words" && then.words !== now.words)
    out.push({ kind: "edited", text: "Your words" });
  for (const n of now.items) {
    const b = before.get(n.ref);
    if (n.included && !b?.included) out.push({ kind: "added", text: n.text });
    else if (n.included && b?.included && b.text !== n.text)
      out.push({ kind: "edited", text: n.text });
  }
  for (const b of then.items) {
    const n = after.get(b.ref);
    if (b.included && !n?.included) out.push({ kind: "left_out", text: b.text });
  }
  return out;
}

export function markReviewed(
  d: SummaryDraft,
  now: SummarySnapshot,
  by: { by: string; at: string },
): SummaryDraft {
  return { ...d, review: { ...by, inputsHash: inputsHash(now), snapshot: now } };
}

/** The effective note text: the clinician's words, or the composed paragraph. */
export const summaryText = (view: SummaryView, d: SummaryDraft) =>
  d.mode === "words" ? (d.words ?? "").trim() : view.text;
