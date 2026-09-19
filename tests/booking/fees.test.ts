import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FEE_FOOTNOTE,
  feeRange,
  formatUgx,
  isFree,
  quoteLine,
  rangeLine,
  resolveFee,
  WAIVER_NOTE,
} from "@/supabase/functions/_shared/fees";

/**
 * Gate G (ADR 0092) — cadre fees: the arithmetic, and the invariants that keep
 * a stated price honest.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const LINE = {
  posture: "full",
  baseFeeUgx: 50_000,
  lineName: "General Medicine",
  cadreFees: [
    { cadreId: "c-consultant", cadreName: "Consultant", feeUgx: 85_000 },
    { cadreId: "c-mo", cadreName: "Medical Officer", feeUgx: 30_000 },
  ],
};

describe("resolveFee — COALESCE(override, base), and nothing else", () => {
  it("a priced cadre takes its own fee and its registered name", () => {
    expect(resolveFee(LINE, "c-consultant")).toEqual({ feeUgx: 85_000, label: "Consultant" });
  });

  it("an unpriced cadre falls back to the line's flat fee — today's behaviour", () => {
    expect(resolveFee(LINE, "c-midwife")).toEqual({ feeUgx: 50_000, label: "General Medicine" });
  });

  it("a line with no overrides behaves exactly as it does before this migration", () => {
    const flat = { ...LINE, cadreFees: [] };
    expect(resolveFee(flat, "c-consultant")).toEqual({
      feeUgx: 50_000,
      label: "General Medicine",
    });
  });

  it("posture 'none' is free, whatever else is set — and free is not zero", () => {
    expect(resolveFee({ ...LINE, posture: "none" }, "c-consultant")).toEqual({
      feeUgx: null,
      label: null,
    });
    expect(isFree({ posture: "none", baseFeeUgx: 50_000 })).toBe(true);
    // A null base is the same answer: nobody has priced this line.
    expect(isFree({ posture: "full", baseFeeUgx: null })).toBe(true);
  });

  it("a null cadre (clinician not yet known) never invents a number", () => {
    expect(resolveFee(LINE, null)).toEqual({ feeUgx: 50_000, label: "General Medicine" });
  });
});

describe("feeRange — what a not-yet-bookable day may say", () => {
  it("spans the base and every override", () => {
    expect(feeRange(LINE)).toEqual({ minUgx: 30_000, maxUgx: 85_000, single: false });
  });

  it("collapses to one number when they agree — the Ugandan norm", () => {
    const flat = { ...LINE, cadreFees: [] };
    expect(feeRange(flat)).toEqual({ minUgx: 50_000, maxUgx: 50_000, single: true });
    expect(rangeLine(feeRange(flat))).toBe("UGX 50,000");
  });

  it("a free line has no range at all", () => {
    expect(feeRange({ ...LINE, posture: "none" })).toBeNull();
    expect(rangeLine(null)).toBeNull();
  });

  it("the range says what it depends on, so its low end is not read as a promise", () => {
    expect(rangeLine(feeRange(LINE))).toBe(
      "UGX 30,000 to UGX 85,000, depending on which clinician you see",
    );
  });
});

describe("the words beside the number", () => {
  it("formats shillings without decimals", () => {
    expect(formatUgx(85_000)).toBe("UGX 85,000");
    expect(formatUgx(50_000.4)).toBe("UGX 50,000");
  });

  it("a quote names the cadre verbatim, never a compliment", () => {
    expect(quoteLine(resolveFee(LINE, "c-consultant"))).toBe("Consultant · UGX 85,000");
    expect(quoteLine({ feeUgx: null, label: null })).toBeNull();
  });

  /**
   * UMDPC 2019 §5(d) forbids implying one practitioner is better qualified
   * than another in the same field; §5(f) and §10(l) make promotional pricing
   * a disciplinary matter. The module may not contain the vocabulary at all.
   */
  it("the fee module carries no promotional or comparative vocabulary", () => {
    const src = read("supabase/functions/_shared/fees.ts")
      // The doc comment names the forbidden words in order to forbid them.
      .replace(/\/\*\*[\s\S]*?\*\//g, "");
    for (const word of [
      "premium",
      "discount",
      "offer",
      "save",
      "best value",
      "cheapest",
      "recommended",
      "top ",
    ]) {
      expect(src.toLowerCase(), `fees.ts uses promotional word "${word}"`).not.toContain(word);
    }
  });

  it("both non-optional sentences exist and say what they must", () => {
    expect(FEE_FOOTNOTE).toBe("You pay at the hospital, not in the app.");
    // MoH July 2025 §2.2(J): waiving for those who cannot pay is a duty.
    expect(WAIVER_NOTE).toContain("Waivers may apply");
  });
});

describe("invariants — a price stays what the patient was told", () => {
  function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
    }
    return out;
  }

  /**
   * The quote is a snapshot, not a pointer — the same rule
   * `arrival_window_start/end` already follows. One writer means no surface,
   * cron or Edge Function can retroactively reprice a held booking.
   */
  it("only the booking core MINTS a quote; a reschedule may only copy the old row's", () => {
    const writers: string[] = [];
    for (const dir of ["app", "lib", "supabase/functions"]) {
      for (const p of walk(resolve(ROOT, dir))) {
        const src = readFileSync(p, "utf8");
        // An assignment, not a read: `quoted_fee_ugx:` inside an insert/update.
        if (/quoted_fee_ugx\s*:/.test(src)) writers.push(p.slice(ROOT.length + 1));
      }
    }
    expect(writers.sort()).toEqual([
      "supabase/functions/_shared/book.ts",
      "supabase/functions/reschedule-appointment/index.ts",
    ]);
    // The reschedule copies the previous row's snapshot verbatim — it never
    // calls the resolver, so a price change cannot reach a held booking.
    const reschedule = readFileSync(
      resolve(ROOT, "supabase/functions/reschedule-appointment/index.ts"),
      "utf8",
    );
    expect(reschedule).toContain("quoted_fee_ugx: appt.quoted_fee_ugx ?? null");
    expect(reschedule).not.toContain("resolveFee(");
    expect(reschedule).not.toContain("quoteFor(");
  });

  /**
   * A fee must never order, filter or badge what a patient is offered: a
   * price-sorted picker steers a poor patient away from seniority and a
   * sicker patient into under-buying it. Ordering stays continuity-then-
   * soonest (PRD §2.7).
   */
  it("no booking surface sorts or filters by fee", () => {
    for (const dir of ["app/patient", "app/reception/book", "lib/patient", "lib/scheduling"]) {
      for (const p of walk(resolve(ROOT, dir))) {
        const src = readFileSync(p, "utf8");
        for (const pattern of [/sort\([^)]*fee/i, /\.filter\([^)]*feeUgx/i, /orderBy\([^)]*fee/i]) {
          expect(pattern.test(src), `${p.slice(ROOT.length + 1)} orders or filters by fee`).toBe(
            false,
          );
        }
      }
    }
  });

  it("the migration keeps free and zero distinguishable, and a quote complete", () => {
    const sql = read("supabase/migrations/0063_cadre_fees.sql");
    expect(sql).toContain("appointments_quoted_fee_complete");
    expect(sql).toContain("service_line_fees_unique UNIQUE (service_line_id, cadre_id)");
    // MoH §3.4.2 obliges a published price list: readable by anyone signed in.
    expect(sql).toMatch(/service_line_fees_select_all[\s\S]*?USING \(true\)/);
    // Writes are the Edge Function's alone — no INSERT/UPDATE/DELETE policy.
    expect(sql).not.toMatch(
      /CREATE POLICY[^;]*ON public\.service_line_fees\s+FOR (INSERT|UPDATE|DELETE)/,
    );
  });
});
