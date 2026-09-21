import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BookingSymptom } from "@/supabase/functions/_shared/symptoms";
import { describe, expect, it } from "vitest";

import {
  complaintLine,
  formatSymptoms,
  MAX_SYMPTOM_LABEL,
  MAX_SYMPTOMS,
  normaliseSymptoms,
  SYMPTOM_DURATION_CODES,
  SYMPTOM_DURATIONS,
  SYMPTOMS_NOTE,
} from "@/supabase/functions/_shared/symptoms";

/**
 * ADR 0095 — symptoms at booking, descriptive only. The pure half pins the
 * shared module three runtimes import; the source half pins that the ONE
 * booking core writes the column, that every writer validates with the same
 * enum, and that a reschedule carries the words along like the note.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const headache: BookingSymptom = { code: "headache", label: "Headache", duration: "days" };
const fever: BookingSymptom = { code: null, label: "Fever", duration: "today" };

describe("the shared vocabulary", () => {
  it("offers exactly five durations, and the codes follow the chips in order", () => {
    expect(SYMPTOM_DURATION_CODES).toHaveLength(5);
    expect(SYMPTOM_DURATION_CODES).toEqual(SYMPTOM_DURATIONS.map((d) => d.code));
    expect(SYMPTOM_DURATION_CODES).toEqual(["today", "days", "week", "weeks", "month_plus"]);
  });

  it("the note states the boundary in the patient's terms", () => {
    expect(SYMPTOMS_NOTE).toBe(
      "This is passed to the clinic as you wrote it. It does not change your place in line or your time.",
    );
  });
});

describe("formatSymptoms / complaintLine — one line for a staff card", () => {
  it("prints label (duration) joined by a middle dot; empty for none", () => {
    expect(formatSymptoms([headache, fever])).toBe("Headache (a few days) · Fever (started today)");
    expect(formatSymptoms([])).toBe("");
    expect(formatSymptoms(null)).toBe("");
    expect(formatSymptoms(undefined)).toBe("");
  });

  it("joins symptoms and the quoted note with an em dash; either alone; null when both absent", () => {
    expect(complaintLine([headache], "worse at night")).toBe(
      "Headache (a few days) — “worse at night”",
    );
    expect(complaintLine([headache], null)).toBe("Headache (a few days)");
    expect(complaintLine(null, "  worse at night ")).toBe("“worse at night”");
    expect(complaintLine([], "   ")).toBeNull();
    expect(complaintLine(null, undefined)).toBeNull();
  });
});

describe("normaliseSymptoms — defensive read of the jsonb column", () => {
  it("returns null for anything that is not a list", () => {
    expect(normaliseSymptoms(null)).toBeNull();
    expect(normaliseSymptoms("Headache")).toBeNull();
    expect(normaliseSymptoms({ label: "Headache", duration: "days" })).toBeNull();
  });

  it("keeps well-formed entries, trims and caps labels, nulls a blank code", () => {
    const out = normaliseSymptoms([
      { code: "headache", label: "  Headache  ", duration: "days" },
      { code: "", label: "x".repeat(MAX_SYMPTOM_LABEL + 20), duration: "today" },
    ]);
    expect(out).toEqual([
      headache,
      { code: null, label: "x".repeat(MAX_SYMPTOM_LABEL), duration: "today" },
    ]);
  });

  it("drops a bad duration, a blank label, a non-object; caps the list at MAX_SYMPTOMS", () => {
    expect(
      normaliseSymptoms([
        { code: null, label: "Fever", duration: "forever" },
        { code: null, label: "   ", duration: "today" },
        "Fever",
        42,
        null,
        fever,
      ]),
    ).toEqual([fever]);
    const many = Array.from({ length: MAX_SYMPTOMS + 3 }, (_, i) => ({
      code: null,
      label: `Symptom ${i}`,
      duration: "today",
    }));
    expect(normaliseSymptoms(many)).toHaveLength(MAX_SYMPTOMS);
  });
});

describe("the writers, at the source", () => {
  it("the booking core writes `symptoms:` in exactly its two row literals, and audits a count only", () => {
    const core = read("supabase/functions/_shared/book.ts");
    const writes = core.match(
      /^\s+symptoms: input\.symptoms\?\.length \? input\.symptoms : null,$/gm,
    );
    expect(writes).toHaveLength(2);
    expect(core).toContain("symptom_count: input.symptoms?.length ?? 0");
    // The words never reach sa_audit_log's free-text afterData.
    expect(core).not.toMatch(/afterData:[\s\S]*?symptoms: input\.symptoms/);
  });

  it("both entry points validate with the shared duration enum and the shared caps", () => {
    for (const fn of ["pt-request-appointment", "ha-book-on-behalf"]) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).toContain("SYMPTOM_DURATION_CODES");
      expect(src, fn).toContain("MAX_SYMPTOM_LABEL");
      expect(src, fn).toContain(".max(MAX_SYMPTOMS)");
      expect(src, fn).toContain("symptoms: input.symptoms ?? null");
    }
    for (const action of ["app/patient/book/actions.ts", "app/reception/book/actions.ts"]) {
      const src = read(action);
      expect(src, action).toContain("SYMPTOM_DURATION_CODES");
      expect(src, action).toContain(".max(MAX_SYMPTOMS)");
    }
  });

  it("a reschedule and a rebooking carry the symptoms along, exactly like the note", () => {
    const reschedule = read("supabase/functions/reschedule-appointment/index.ts");
    expect(reschedule).toContain("reason_note: appt.reason_note,");
    expect(reschedule).toContain("symptoms: appt.symptoms ?? null,");
    const rebook = read("supabase/functions/pt-accept-rebooking/index.ts");
    expect(rebook).toContain("symptoms: old.symptoms ?? null,");
  });

  it("migration 0065 keeps the column a list", () => {
    const sql = read("supabase/migrations/0065_symptoms_and_custom_blocks.sql");
    expect(sql).toContain("appointments_symptoms_is_list");
    expect(sql).toMatch(/jsonb_typeof\(symptoms\) = 'array'/);
  });
});
