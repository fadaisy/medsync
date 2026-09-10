/**
 * Date of birth to life stage — pure, no I/O (ADR 0083).
 *
 * Its own module rather than a helper beside the demographics query, because it
 * is a clinical convention that belongs under test and the query module pulls in
 * the database. Nothing about banding an age needs a connection.
 */
import type { AgeBand } from "@/lib/ncd/catalog/schema";

/**
 * Date of birth to life stage.
 *
 * ── The boundaries, and their standing ───────────────────────────────────────
 * 10 and 20 are WHO's definition of adolescence (10-19 inclusive). 65 is the
 * threshold ADA's "Older Adults" section applies from. 28 days and 1 year are
 * the ordinary neonatal and infant definitions.
 *
 * These are CONVENTIONS, not ratified catalog content — which is why they live
 * in engine code rather than posing as a cited `Citation`. They are listed in
 * the CSO handover for ratification, and a site that bands differently changes
 * this one function rather than every threshold in every catalog.
 *
 * Returns `undefined` rather than throwing on an unparseable date. A missing
 * band leaves everything in scope, and a wrong band silently narrows an
 * examination — so the failure is deliberately the loud, harmless one.
 */
export function ageBandFromDob(dob: string, now: Date = new Date()): AgeBand | undefined {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return undefined;

  const days = (now.getTime() - born.getTime()) / 86_400_000;
  // A date of birth in the future is bad data, not a newborn.
  if (days < 0) return undefined;
  if (days < 28) return "neonate";

  let years = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) years--;

  if (years < 1) return "infant";
  if (years < 10) return "child";
  if (years < 20) return "adolescent";
  if (years < 65) return "adult";
  return "older_adult";
}
