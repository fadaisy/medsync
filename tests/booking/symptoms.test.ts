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

describe("v2 (ADR 0098 ruling 3) — a duration is optional, a catalog item carries qualifiers", () => {
  const chest: BookingSymptom = {
    code: "SYM.CHEST.PAIN_SPREADING",
    label: "Chest pain spreading to arm or jaw",
    qualifiers: [
      { key: "spreading", option: "arm", label: "to the arm" },
      { key: "sweating", option: "yes", label: "with sweating" },
    ],
  };

  it("keeps an entry with no duration, and one with an explicit null", () => {
    expect(
      normaliseSymptoms([
        { code: "x", label: "Chest pain" },
        { code: null, label: "Fever", duration: null },
      ]),
    ).toEqual([
      { code: "x", label: "Chest pain" },
      { code: null, label: "Fever" },
    ]);
  });

  it("validates qualifiers: trims, caps at two, drops a malformed one — never the entry", () => {
    const out = normaliseSymptoms([
      {
        ...chest,
        qualifiers: [
          ...chest.qualifiers!,
          { key: "third", option: "x", label: "over the cap" },
          { key: 42, option: "y", label: "not a string" },
        ],
      },
      { code: null, label: "Cough", qualifiers: [{ key: "", option: "x", label: "blank key" }] },
      { code: null, label: "Rash", qualifiers: "spots" },
    ]);
    expect(out).toEqual([chest, { code: null, label: "Cough" }, { code: null, label: "Rash" }]);
  });

  it("formats label, then (duration) only when given, then each qualifier as ', words'", () => {
    expect(formatSymptoms([chest])).toBe(
      "Chest pain spreading to arm or jaw, to the arm, with sweating",
    );
    expect(formatSymptoms([{ ...chest, duration: "today" }])).toBe(
      "Chest pain spreading to arm or jaw (started today), to the arm, with sweating",
    );
    expect(formatSymptoms([{ code: null, label: "Cough" }, headache])).toBe(
      "Cough · Headache (a few days)",
    );
    // An old row prints exactly as it always did.
    expect(complaintLine([headache, fever], null)).toBe(
      "Headache (a few days) · Fever (started today)",
    );
  });

  it("every zod mirror accepts a missing or null duration and the qualifier caps", () => {
    for (const path of [
      "supabase/functions/pt-request-appointment/index.ts",
      "supabase/functions/ha-book-on-behalf/index.ts",
      "app/patient/book/actions.ts",
      "app/reception/book/actions.ts",
    ]) {
      const src = read(path);
      expect(src, path).toContain("duration: z.enum(SYMPTOM_DURATION_CODES).nullable().optional()");
      expect(src, path).toContain(".max(MAX_SYMPTOM_QUALIFIERS)");
      expect(src, path).toContain("MAX_QUALIFIER_KEY");
      expect(src, path).toContain("MAX_QUALIFIER_LABEL");
    }
  });

  it("the booking core writes the tier and submission on the ROW, never on an element", () => {
    const core = read("supabase/functions/_shared/book.ts");
    expect(core.match(/^\s+symptom_tier: input\.symptomTier \?\? null,$/gm)).toHaveLength(2);
    expect(
      core.match(/^\s+symptom_submission_id: input\.symptomSubmissionId \?\? null,$/gm),
    ).toHaveLength(2);
    expect(core.match(/^\s+priority: input\.priority \?\? "routine",$/gm)).toHaveLength(2);
    expect(core).toContain("symptom_tier: row.symptom_tier ?? null");
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
      // The validated list reaches the core — directly, or via the local the
      // patient function narrows when a catalog submission replaces it (ADR 0098).
      expect(src, fn).toMatch(/symptoms(?::| =) input\.symptoms \?\? null/);
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
