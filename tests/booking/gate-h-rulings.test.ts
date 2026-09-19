import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CANCEL_CODES, cancellationSentence } from "@/supabase/functions/_shared/cancel-reasons";

/**
 * Gate H (ADR 0094) — the six parked rulings, held by test. Source-level in
 * the house style of the gate D/E/F suites: migrations 0060–0064 are GATED,
 * so the dev DB may not carry them, and these rules are about what a writer
 * puts in a row and what a surface prints, not about a row's contents.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const fn = (name: string) => read(`supabase/functions/${name}/index.ts`);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("ruling (a) — four-eyes on un-reconcile: today's bar stands", () => {
  it("ha-reconcile-identity records the ruling and keeps the 20-char reason", () => {
    const src = fn("ha-reconcile-identity");
    expect(src).toContain("No four-eyes step");
    expect(src).toContain('(i.reason ?? "").length >= 20');
  });
});

describe("ruling (b) — cross-tenant un-reconcile", () => {
  const src = fn("ha-reconcile-identity");

  it("counts rows at OTHER hospitals under the provisional, for appointments and intakes", () => {
    expect(src).toMatch(/\.neq\("hospital_id", input\.hospital_id\)/);
    expect(src).toContain(
      '(await elsewhere("appointments")) + (await elsewhere("patient_intakes"))',
    );
  });

  it("a hospital_admin gets 409 with the count; a superadmin reverses everywhere", () => {
    expect(src).toContain("if (rowsElsewhere > 0 && !isSuperadmin)");
    expect(src).toContain("Only a superadmin can un-reconcile across hospitals.");
    expect(src).toContain("const everyHospital = isSuperadmin && rowsElsewhere > 0;");
    // The hospital filter is dropped ONLY on the superadmin branch.
    expect(src).toContain(
      'if (!everyHospital) apptQuery = apptQuery.eq("hospital_id", input.hospital_id);',
    );
    expect(src).toContain(
      'if (!everyHospital) intakeQuery = intakeQuery.eq("hospital_id", input.hospital_id);',
    );
  });

  it("the audit after-data says how far the reversal reached", () => {
    expect(src).toContain('scope: everyHospital ? "all_hospitals" : "this_hospital"');
    expect(src).toContain("rows_at_other_hospitals: rowsElsewhere");
  });
});

describe("ruling (c) — the server refuses a stated minor at the desk", () => {
  const src = fn("ha-book-on-behalf");

  it("refuses under 18 by age or by date of birth, in the hospital's zone, before any write", () => {
    expect(src).toContain('const MINOR_REFUSAL = "Booking for a child is not available yet.";');
    expect(src).toContain("if (statedAge < ADULT_YEARS) return badRequest(MINOR_REFUSAL, init);");
    expect(src).toContain("localDateKey(new Date(), DEFAULT_TIME_ZONE)");
    const body = stripComments(src);
    expect(body.indexOf("MINOR_REFUSAL, init")).toBeLessThan(
      body.indexOf("await getCaller(request)"),
    );
  });

  it("the same sentence the desk form shows", () => {
    expect(read("app/reception/book/_components/desk-booking.tsx")).toContain(
      'const MINOR_REFUSAL = "Booking for a child is not available yet.";',
    );
  });
});

describe("ruling (d) — staff cancel reasons are staff only", () => {
  it("cancellationSentence: a code becomes one sentence, never the column", () => {
    for (const code of CANCEL_CODES) {
      const s = cancellationSentence("cancelled", code);
      expect(s, code).toBeTruthy();
      expect(s).not.toContain(code);
    }
    // A live visit has no sentence; a declined request has its own.
    expect(cancellationSentence("confirmed", null)).toBeNull();
    expect(cancellationSentence("declined", null)).toBe("The clinic could not take this request.");
    expect(cancellationSentence("rescheduled", "Rescheduled to 2026-10-01T09:00:00Z")).toBe(
      "Moved to another day.",
    );
    // A legacy row's words, or an unknown writer's, are never echoed.
    const words = "Dr Okello double-booked; patient has HIV clinic that day";
    expect(cancellationSentence("cancelled", words)).toBe("This visit was cancelled.");
    expect(cancellationSentence("cancelled", null)).toBe("This visit was cancelled.");
  });

  it("every writer puts a closed code in appointments.cancelled_reason, the words in the audit row", () => {
    const cancel = stripComments(fn("cancel-appointment"));
    expect(cancel).not.toContain("cancelled_reason: input.reason");
    expect(cancel).toContain("cancelled_reason: cancelledReason");
    expect(cancel).toContain('{ patient: "patient_cancelled", staff: "staff_cancelled" }');
    expect(cancel).toContain("reason: input.reason"); // the audit row keeps the text

    const session = stripComments(fn("ha-cancel-session"));
    expect(session).toContain('cancelled_reason: "session_cancelled"');
    // The staff words go on clinic_sessions — a row RLS shows patients only while published.
    expect(read("supabase/migrations/0058_service_lines_and_sessions.sql")).toContain(
      "USING (status = 'published')",
    );

    const decline = stripComments(fn("ha-decline-appointment-request"));
    expect(decline).not.toContain("declined_reason");
    expect(decline).toContain('.update({ status: "declined" })');
    expect(decline).toContain("reason: input.reason");

    // ha-cancel-clinician-availability refuses when live bookings exist; it never writes the column.
    expect(stripComments(fn("ha-cancel-clinician-availability"))).not.toContain("cancelled_reason");
  });

  it("the codes written are the codes the mapping knows", () => {
    const written = new Set<string>(["session_cancelled", "patient_cancelled", "staff_cancelled"]);
    expect(read("app/api/cron/dispatch-reminders/route.ts")).toContain(
      'cancelledReason: "unconfirmed_release"',
    );
    written.add("unconfirmed_release");
    for (const code of written) expect(CANCEL_CODES).toContain(code);
  });

  it("no patient or agent surface prints the raw column; each maps it through cancellationSentence", () => {
    const surfaces = [
      ...walk(resolve(ROOT, "app/patient")),
      ...walk(resolve(ROOT, "mobile/src")),
      ...walk(resolve(ROOT, "supabase/functions")).filter((p) =>
        /\/(pt-[^/]+|system-ussd-[^/]+|_shared)\//.test(p),
      ),
    ];
    for (const p of surfaces) {
      if (p.endsWith("_shared/cancel-reasons.ts")) continue;
      const src = stripComments(readFileSync(p, "utf8"));
      // The column is never interpolated into copy or JSX.
      expect(src, p).not.toMatch(
        /\$\{[^}]*(cancelled_reason|cancelledReason|declined_reason|declinedReason)/,
      );
      expect(src, p).not.toMatch(/\{\s*(row|visit|r|appt|a)\.cancelledReason\s*\}/);
      expect(src, p).not.toMatch(/declined_reason|declinedReason/);
      // A surface that reads the column maps it (or compares it to the one code the card branches on).
      if (/cancelledReason/.test(src) && /\.tsx$/.test(p)) {
        expect(src, p).toContain("cancellationSentence(");
      }
    }
  });

  it("no staff surface reads the free text from the row either — there is none to read", () => {
    for (const p of [
      ...walk(resolve(ROOT, "app/reception")),
      ...walk(resolve(ROOT, "app/hospital-admin")),
    ]) {
      expect(stripComments(readFileSync(p, "utf8")), p).not.toMatch(
        /cancelledReason|declinedReason/,
      );
    }
  });

  it("migration 0064 rewrites legacy words to codes and is GATED", () => {
    const sql = read("supabase/migrations/0064_cancel_reason_codes.sql");
    expect(sql).toContain("GATED");
    expect(sql).toContain("SET cancelled_reason = CASE");
    expect(sql).toContain("SET declined_reason = NULL");
  });
});

describe("ruling (e) — empty future instances follow the new rule; booked ones keep their promise", () => {
  const src = stripComments(fn("ha-upsert-session-template"));

  it("re-stamps an empty published instance in place, guarded on booked_count = 0 in the UPDATE", () => {
    const restamp = src.slice(
      src.indexOf("const inPlace = emptyByStart.get"),
      src.indexOf("restamped +="),
    );
    expect(restamp).toContain(".update({ ...stamp, ends_at: endsAt.toISOString() })");
    expect(restamp).toContain('.eq("status", "published")');
    expect(restamp).toContain('.eq("booked_count", 0)');
  });

  it("empty instances the new rule no longer names take the deactivation path", () => {
    expect(src).toContain("cancelled = await cancelEmpty([...emptyByStart.values()]);");
    const cancelEmpty = src.slice(
      src.indexOf("const cancelEmpty = async"),
      src.indexOf("if (input.active) {"),
    );
    expect(cancelEmpty).toContain('.eq("booked_count", 0)');
    expect(cancelEmpty).toContain('.gt("starts_at", nowIso)');
  });

  it("a booked instance is never touched: the INSERT still treats 23505 as already materialised", () => {
    expect(src).toContain('if (insertError && insertError.code !== "23505")');
  });
});

describe("ruling (f) — consent re-acceptance on next sign-in", () => {
  it("web: requirePatientScope gates on the ACTIVE data_processing text by version AND hash", () => {
    const scope = stripComments(read("lib/patient/scope.ts"));
    expect(scope).toContain(
      'if (consent && consent.acceptedAt === null) redirect("/patient/consent");',
    );
    expect(scope).toContain('eq(consentVersions.consentType, "data_processing")');
    expect(scope).toContain("eq(consentRecords.version, active.version)");
    expect(scope).toContain("eq(consentRecords.consentTextSha256, active.bodySha256)");
    expect(scope).toContain("isNull(consentRecords.revokedAt)");
  });

  it("web: the layout and the consent page resolve the scope without the gate; every other page requires it", () => {
    const files = walk(resolve(ROOT, "app/patient"));
    for (const p of files) {
      const src = stripComments(readFileSync(p, "utf8"));
      const ungated = /app\/patient\/(layout\.tsx|consent\/)/.test(p);
      if (ungated) {
        expect(src, p).not.toMatch(/\brequirePatientScope\(/);
        continue;
      }
      expect(src, p).not.toContain("resolvePatientScope");
      // Every page and every server action calls the gate itself — a client
      // component's form can post an action long after the page redirected.
      if (/\/(page\.tsx|actions\.ts)$/.test(p)) {
        expect(src, p).toMatch(/\brequirePatientScope\(/);
      }
    }
    expect(read("app/patient/consent/page.tsx")).toContain("<AcceptConsentForm");
  });

  it("web: the action writes consent_records the way signup does — the posted version + hash must match the live row", () => {
    const action = stripComments(read("app/patient/consent/actions.ts"));
    expect(action).toContain("active.version !== parsed.data.data_processing_consent_version");
    expect(action).toContain("db.insert(consentRecords).values({");
    expect(action).toContain('consentType: "data_processing"');
    expect(action).toContain("consentTextSha256: active.bodySha256");
    expect(action).not.toContain("backfill");
  });

  it("phone: the same check on session load, and the gate is a Stack.Protected pair over every screen", () => {
    const session = stripComments(read("mobile/src/lib/session.tsx"));
    expect(session).toContain('.from("consent_versions")');
    // THIS user's record: the RLS policy also admits a superadmin to every row.
    expect(session).toContain('.eq("user_id", userId)');
    expect(session).toContain('.eq("consent_text_sha256", v.body_sha256)');
    expect(session).toContain('.is("revoked_at", null)');
    expect(session).toContain('.from("consent_records").insert({');
    // A failed read is "unknown", never "clear"; a lost reply's 23505 is an acceptance.
    expect(session).toContain('setConsentFor({ userId, state: { kind: "unknown" } })');
    expect(session).toContain('error.code !== "23505"');

    const layout = stripComments(read("mobile/src/app/(app)/_layout.tsx"));
    // Only `clear` opens the workspace — checking and unknown keep it closed.
    expect(layout).toContain('const gated = consent.kind !== "clear";');
    expect(layout).toContain("<Stack.Protected guard={gated}>");
    expect(layout).toContain('<Stack.Screen name="consent" />');
    expect(layout).toContain("<Stack.Protected guard={!gated}>");
    // Every route file under (app) is named in the layout, so none escapes the guard.
    const routes = walk(resolve(ROOT, "mobile/src/app/(app)"))
      .map((p) => p.slice(resolve(ROOT, "mobile/src/app/(app)").length + 1).replace(/\.tsx$/, ""))
      .filter((r) => !r.endsWith("_layout") && r !== "consent")
      .map((r) => (r.startsWith("(tabs)/") ? "(tabs)" : r));
    for (const r of new Set(routes)) expect(layout, r).toContain(`<Stack.Screen name="${r}" />`);

    const screen = stripComments(read("mobile/src/app/(app)/consent.tsx"));
    expect(screen).toContain("acceptConsent(due)");
    expect(screen).toContain("onAccepted={consentAccepted}");
    // The Emergency tab is behind the gate, so the block itself is on this screen (ADR 0085 §5).
    expect(screen).toContain("<EmergencyNotice");
    expect(screen).toContain('consent.kind === "unknown"');
  });
});
