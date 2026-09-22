import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The patient-side Edge Functions of the symptom catalog and the Emergency
 * Pathway (PRD MS-PRD-SYM-001 §9.4; ADR 0098 rulings 1, 6, 8). Source-level,
 * like tests/identity/gate-d-invariants: Deno functions do not run under
 * Vitest, and these rules are about what each function reads, which core it
 * writes through, and the order of audit and mutation.
 */
const fn = (name: string) =>
  readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf8");

/** Comments explain the rule; they must not be mistaken for violations of it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const zodBlock = (src: string) => {
  const start = src.indexOf("const InputSchema = z.object({");
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("});", start));
};

describe("pt-submit-symptoms — the server classifies, never the client", () => {
  const src = stripComments(fn("pt-submit-symptoms"));

  it("recomputes the tier with classify(CATALOG) and returns the server's answer", () => {
    expect(src).toContain("classify(");
    expect(src).toContain('from "../_shared/symptom-catalog/index.ts"');
    expect(src).toContain("computed_tier: classification.tier");
  });

  it("never reads a client 'tier' field", () => {
    expect(zodBlock(src)).not.toMatch(/tier/);
    expect(src).not.toMatch(/input\.tier|body\.tier/);
  });

  it("refuses unknown item keys rather than dropping them", () => {
    expect(src).toContain("unknown_items");
  });

  it("encrypts free text before it touches the row, or refuses", () => {
    expect(src).toContain('from "../_shared/encryption.ts"');
    expect(src).toContain("free_text_enc: freeTextEnc");
    expect(src).not.toMatch(/free_text_enc:\s*input\.free_text/);
  });

  it("writes outcome 'abandoned' — the later writers set the rest", () => {
    expect(src).toContain('outcome: "abandoned"');
  });

  it("audits counts and the tier, never labels or free text", () => {
    const audit = src.slice(
      src.indexOf("recordSaAudit({"),
      src.indexOf("});", src.indexOf("recordSaAudit({")),
    );
    expect(audit).toContain("tier: classification.tier");
    expect(audit).toContain("item_count");
    expect(audit).toContain("catalog_version");
    expect(audit).not.toMatch(/\bitems:|\bfree_text:|free_text_enc|\blabel/);
  });
});

describe("pt-request-same-day — one search, one writer, today only", () => {
  const src = stripComments(fn("pt-request-same-day"));

  it("books through bookAppointment, the ONE writer", () => {
    expect(src).toMatch(/import \{[^}]*bookAppointment[^}]*\} from "\.\.\/_shared\/book\.ts"/);
    expect(src).toContain("await bookAppointment(");
    expect(src).not.toMatch(/from\("appointments"\)\s*\.insert/);
  });

  it("bounds the urgent-slot search to endOfLocalDay", () => {
    expect(src).toContain('from "../_shared/urgent-slot.ts"');
    expect(src).toContain("endOfLocalDay(now, DEFAULT_TIME_ZONE)");
  });

  it("books urgent + new_concern with the tier and the submission on the row (ruling 6)", () => {
    expect(src).toContain('priority: "urgent"');
    expect(src).toContain('reason: "new_concern"');
    expect(src).not.toContain("urgent_review");
    expect(src).toContain("symptomTier: sub.computed_tier");
    expect(src).toContain("symptomSubmissionId: sub.id");
    expect(src).toContain("horizonDays: SAME_DAY_HORIZON_DAYS");
  });

  it("no slot is a 404 with its own code; the report becomes same_day on success", () => {
    expect(src).toContain('code: "no_same_day_slot"');
    expect(src).toContain('outcome: "same_day", appointment_id: result.row.id');
  });

  it("only the caller's own U report, or an E report whose interrupt was declined", () => {
    expect(src).toContain("sub.patient_user_id !== caller.id");
    expect(src).toContain('sub.computed_tier === "U"');
    expect(src).toContain('sub.outcome === "emergency_declined"');
  });
});

describe("pt-declare-intake — the queue door links the report", () => {
  const src = stripComments(fn("pt-declare-intake"));

  it("accepts an optional symptom_submission_id and checks it is the caller's", () => {
    expect(zodBlock(src)).toContain("symptom_submission_id: z.string().uuid().optional()");
    expect(src).toContain("submission.patient_user_id !== caller.id");
  });

  it("derives priority_hint from the tier through the shared table and words from the catalog", () => {
    expect(src).toContain("TIER_PRIORITY_HINT[submission.computed_tier]");
    expect(src).toContain("submissionSymptoms(CATALOG, submission)");
    expect(src).toContain("priority_hint: priorityHint");
  });

  it("marks the report queued with the intake id", () => {
    expect(src).toContain('outcome: "queued", intake_id: created.id');
  });

  it("writes the linkage column only when a report exists (a DB without 0066 sees the old INSERT)", () => {
    expect(src).toContain("...(submission ? { symptom_submission_id: submission.id } : {})");
  });
});

describe("pt-emergency-event — a call tap is never blocked", () => {
  const src = stripComments(fn("pt-emergency-event"));

  it("returns ok( in its catch", () => {
    const catchAt = src.lastIndexOf("} catch (e) {");
    expect(catchAt).toBeGreaterThan(-1);
    expect(src.slice(catchAt)).toContain("return ok(");
  });

  it("attributes a signed-out event to the system actor", () => {
    expect(src).toContain("caller?.id ?? systemActorId()");
  });

  it("a decline marks only the caller's own abandoned report emergency_declined", () => {
    expect(src).toContain('.update({ outcome: "emergency_declined" })');
    expect(src).toContain('.eq("outcome", "abandoned")');
    expect(src).toContain("patient_user_id.eq.${caller.id},reporter_user_id.eq.${caller.id}");
  });
});

describe("pt-emergency-sheet — verified numbers, never PHI", () => {
  const src = stripComments(fn("pt-emergency-sheet"));

  it("filters on verification_status and active", () => {
    expect(src).toContain('.in(\n        "verification_status"');
    expect(src).toContain('.eq("active", true)');
    expect(src).toContain('["verified"]');
  });

  it("drafts only outside production, tagged", () => {
    expect(src).toContain('Deno.env.get("MEDSYNC_ENV") !== "production"');
    expect(src).toContain("draft: true");
  });

  it("the own hospital's emergency_phone is a synthetic verified contact", () => {
    expect(src).toContain("id: `hospital:${own.id}`");
    expect(src).toContain("number: own.emergencyPhone");
  });

  it("reads no PHI table and writes nothing", () => {
    expect(src).toMatch(/\.from\("emergency_contacts"\)/);
    expect(src).toMatch(/\.from\("hospitals"\)/);
    expect(src).not.toMatch(
      /\.from\("(symptom_submissions|emergency_pre_arrivals|patient_profiles|patient_intakes|appointments)"\)/,
    );
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(src).not.toContain("recordSaAudit");
  });
});

describe("audit FIRST, fail closed — every writer except the two the PRD exempts", () => {
  const writers: ReadonlyArray<[string, RegExp]> = [
    ["pt-submit-symptoms", /from\("symptom_submissions"\)\.insert\(/],
    ["pt-request-same-day", /await bookAppointment\(/],
  ];

  it.each(writers)("%s audits before it mutates", (name, mutation) => {
    const src = stripComments(fn(name)).replace(/\s+/g, " ");
    const auditAt = src.indexOf("await recordSaAudit(");
    const mutationAt = src.search(mutation);
    expect(auditAt, "audit call").toBeGreaterThan(-1);
    expect(mutationAt, "mutation").toBeGreaterThan(-1);
    expect(mutationAt).toBeGreaterThan(auditAt);
    // Fail closed: the audit sits in a try whose catch answers 500.
    expect(src).toContain('return serverError("audit write failed", init)');
  });

  it("pt-emergency-sheet is read-only and pt-emergency-event is best-effort", () => {
    expect(stripComments(fn("pt-emergency-sheet"))).not.toContain("recordSaAudit");
    expect(stripComments(fn("pt-emergency-event"))).not.toContain("audit write failed");
  });
});
