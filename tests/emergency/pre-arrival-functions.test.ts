import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The pre-alert engine's Edge Functions and the facility/superadmin writers
 * (PRD MS-PRD-SYM-001 §8.7, §9.4, §9.6; ADR 0098 rulings 5, 8, 10).
 * Source-level, like tests/emergency/rls-as-written: Deno functions do not
 * run under Vitest, and these rules are about ORDER (audit before the
 * write), IMPORTS (one intake writer, one status machine, one set of rate
 * limits) and what may never reach a log line or a column.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fn = (name: string) => stripComments(read(`supabase/functions/${name}/index.ts`));

const WRITERS = [
  "pt-create-pre-arrival",
  "pt-pre-arrival-status",
  "ha-update-pre-arrival",
  "ha-pre-arrival-arrived",
  "ha-set-hospital-emergency-settings",
  "sa-verify-emergency-contact",
  "sa-sign-catalog-version",
];

/** Identifiers that hold a phone, a coordinate, a token or a hash — none may be a logged value. */
const SENSITIVE = [
  "callbackPhone",
  "callbackPhoneEnc",
  "input.callback_phone",
  "input.share_location",
  "input.device_hash",
  "locationEnc",
  "token",
  "tokenBytes",
  "reporterTokenHash",
  "phoneHash",
  "deviceHash",
];
/** `{ name }`, `{ name, …}`, `key: name,` or `key: name }` — a boolean derived from it (`name !== null`) is fine. */
const logsValue = (name: string) => {
  const id = name.replace(/\./g, "\\.");
  return new RegExp(`(?:[{,]\\s*${id}\\s*[,}])|(?::\\s*${id}\\s*[,}])`);
};

/** Every `log.<level>(msg, {…})` context object in a source file. */
const logContexts = (src: string): string[] =>
  [...src.matchAll(/log\.(?:info|warn|error)\([^,]+,\s*(\{[\s\S]*?\})\s*\)/g)].map(
    (m) => m[1] as string,
  );

describe("every writer audits FIRST (fail closed)", () => {
  for (const name of WRITERS) {
    it(`${name}: recordSaAudit precedes its first insert/update/upsert`, () => {
      const src = fn(name);
      const audit = src.indexOf("await recordSaAudit(");
      expect(audit, "no audit call").toBeGreaterThan(-1);
      const firstWrite = Math.min(
        ...[".insert(", ".update(", ".upsert("]
          .map((needle) => src.indexOf(needle))
          .filter((i) => i > -1),
      );
      expect(firstWrite, "no write at all").toBeGreaterThan(-1);
      expect(audit).toBeLessThan(firstWrite);
      // An audit failure aborts — never swallowed.
      expect(src).toMatch(/catch \(e\) \{[\s\S]*?(audit write failed)/);
    });
  }
});

describe("pt-create-pre-arrival — a bystander can act, and nothing sensitive leaks", () => {
  const src = fn("pt-create-pre-arrival");

  it("the caller is optional and `verified` derives from it alone", () => {
    expect(src).toContain("const caller = await getCaller(request);");
    expect(src).toContain("const verified = !!caller;");
    expect(src).not.toContain("if (!caller) return unauthorized(init)");
    expect(src).toContain("if (!caller && !callbackPhone)");
  });

  it("never logs the callback phone, the location or the token", () => {
    const contexts = logContexts(src);
    expect(contexts.length).toBeGreaterThan(3);
    for (const ctx of contexts) {
      for (const name of SENSITIVE) expect(ctx, name).not.toMatch(logsValue(name));
    }
  });

  it("stores the token only as a blind index, returned once", () => {
    expect(src).toContain("reporterTokenHash = await blindIndex(token, phiKey)");
    const insert = src.slice(
      src.indexOf('from("emergency_pre_arrivals").insert('),
      src.indexOf("if (insertError)"),
    );
    expect(insert).toContain("reporter_token_hash: reporterTokenHash");
    expect(insert).not.toMatch(/\btoken\b/);
    expect(insert).toContain("callback_phone_enc: callbackPhoneEnc");
    expect(insert).toContain("location_enc: locationEnc");
    expect(insert).not.toMatch(/\bcallbackPhone,|callback_phone:/);
    // Hashes, not values, in the rate-limit columns.
    expect(insert).toContain("device_hash: deviceHash");
    expect(insert).toContain("phone_hash: phoneHash");
    expect(src).toContain("deviceHash = await blindIndex(input.device_hash, phiKey)");
  });

  it("encrypts with MEDSYNC_PHI_KEY and refuses a plaintext fallback", () => {
    expect(src).toContain('Deno.env.get("MEDSYNC_PHI_KEY")');
    expect(src).toContain("callbackPhoneEnc = await encrypt(callbackPhone, phiKey)");
    // Location only for a facility that can dispatch to it (ambulance line), whatever the client sent.
    expect(src).toContain(
      "const shareLocation = facility.ambulance_number ? input.share_location : null",
    );
    expect(src).toContain("locationEnc = await encrypt(JSON.stringify(shareLocation), phiKey)");
  });

  it("rate limits and the hoax downgrade come from _shared/pre-arrival.ts", () => {
    const importBlock = src.slice(
      src.indexOf("import {\n  composeFacilitySms"),
      src.indexOf('"../_shared/pre-arrival.ts"'),
    );
    for (const name of ["RATE_LIMITS", "HOAX_DOWNGRADE_THRESHOLD", "HOAX_DOWNGRADE_MS"]) {
      expect(importBlock, name).toContain(name);
    }
    expect(src).toContain("RATE_LIMITS.perDeviceHour");
    expect(src).toContain("RATE_LIMITS.perPhoneDay");
    expect(src).toContain("hoaxes >= HOAX_DOWNGRADE_THRESHOLD");
    expect(src).toContain('code: "call_only"');
    expect(src).not.toMatch(/perDeviceHour\s*[:=]\s*\d/);
  });

  it("refuses unknown catalog keys and facilities without pre_alert_enabled", () => {
    expect(src).toContain("if (!facility.pre_alert_enabled)");
    expect(src).toContain("unknown_items: unknown");
  });

  it("audits create_pre_arrival with the caller or the system actor, ids and counts only", () => {
    expect(src).toContain("const actorId = caller?.id ?? systemActorId();");
    expect(src).toContain('action: "create_pre_arrival"');
    const audit = src.slice(src.indexOf("await recordSaAudit("), src.indexOf("const expiresAt"));
    expect(audit).toContain("red_flag_count");
    expect(audit).not.toMatch(/callback|location_enc|share_location|token/);
  });
});

describe("the status machine is the one in _shared/pre-arrival.ts", () => {
  for (const name of ["pt-pre-arrival-status", "ha-update-pre-arrival", "ha-pre-arrival-arrived"]) {
    it(`${name}: imports canTransition and checks it before the UPDATE`, () => {
      const src = fn(name);
      expect(src).toContain('import { canTransition } from "../_shared/pre-arrival.ts";');
      const check = src.indexOf("if (!canTransition(");
      expect(check).toBeGreaterThan(-1);
      expect(check).toBeLessThan(src.indexOf('from("emergency_pre_arrivals")\n    .update('));
      expect(src).not.toMatch(/PRE_ARRIVAL_TRANSITIONS\s*[:=]/);
      // Re-pinned on the status read, so concurrent board clicks conflict instead of overwriting.
      expect(src).toContain('.eq("status", pa.status)');
    });
  }

  it("pt-pre-arrival-status: the token is checked as a blind index, or the caller owns the row", () => {
    const src = fn("pt-pre-arrival-status");
    expect(src).toContain("(await blindIndex(input.token, phiKey)) === pa.reporter_token_hash");
    expect(src).toContain("caller.id === pa.patient_user_id || caller.id === pa.reporter_user_id");
    expect(src).toContain('if (!owned) return notFound(init, "pre-alert not found");');
    expect(src).toContain('input.action === "cancel" ? "cancelled" : "arrived"');
    for (const ctx of logContexts(src)) expect(ctx).not.toMatch(/\btoken\b/);
  });

  it("ha-update-pre-arrival: facility from the row, authoriseAtHospital, reason for the closing words", () => {
    const src = fn("ha-update-pre-arrival");
    expect(src).toContain("authoriseAtHospital(caller.id, pa.facility_id)");
    expect(src).toContain('z.enum(["seen", "ready", "not_arriving", "hoax"])');
    expect(src).toContain('v.status !== "not_arriving" && v.status !== "hoax"');
    expect(src).toContain("patch.acknowledged_by_user_id = caller.id");
    expect(src).toContain("patch.ready_at = nowIso");
    expect(src).toContain("patch.closed_at = nowIso");
  });
});

describe("ha-pre-arrival-arrived — one intake writer, never a second intake", () => {
  const src = fn("ha-pre-arrival-arrived");

  it("imports registerIntake from _shared/intake.ts and never inserts into patient_intakes", () => {
    expect(src).toContain('import { registerIntake } from "../_shared/intake.ts";');
    expect(src).toContain("await registerIntake(");
    expect(src).not.toMatch(/from\("patient_intakes"\)[\s\S]{0,80}\.insert\(/);
  });

  it("links a live intake today instead of creating one", () => {
    expect(src).toContain('["declared", "arrived", "awaiting_triage", "triaged"]');
    expect(src).toContain("startOfLocalDay(new Date(), DEFAULT_TIME_ZONE)");
    expect(src).toMatch(/from\("patient_intakes"\)\s*\.update\(\{\s*pre_arrival_id: pa\.id/);
    expect(src).toContain("linked: existingIntakeId !== null");
  });

  it("registers as the pre-alerted emergency type, casualty, urgent, with both links", () => {
    const call = src.slice(src.indexOf("await registerIntake("), src.indexOf("if (!result.ok)"));
    expect(src).toContain('const ENTRY_TYPE_CODE = "self_presentation_prealerted";');
    expect(call).toContain('entryPoint: "casualty"');
    expect(call).toContain('priorityHintOverride: "urgent"');
    expect(call).toContain("preArrivalId: pa.id");
    expect(call).toContain("symptomSubmissionId: pa.submission_id");
    expect(call).toContain("presentingComplaint: presentingComplaint(");
    expect(src).toContain('parts.join(" · ").slice(0, COMPLAINT_MAX)');
    expect(src).toContain('"Isolation: fever with bleeding"');
  });
});

describe("the facility and superadmin writers", () => {
  it("ha-set-hospital-emergency-settings: board owner in words, ambulance contact never verified here", () => {
    const src = fn("ha-set-hospital-emergency-settings");
    expect(src).toContain("if (next.pre_alert_enabled && !next.board_owner_note)");
    expect(src).toContain("requireHospitalAdminScope(caller.id, input.hospital_id)");
    expect(src).toContain("`FACILITY.${hospital.id}.AMBULANCE`");
    const upsert = src.slice(
      src.indexOf('from("emergency_contacts").upsert('),
      src.indexOf("{ onConflict"),
    );
    expect(upsert).toContain('scope: "facility"');
    expect(upsert).toContain('kind: "ambulance"');
    expect(upsert).toContain('verification_status: "unverified"');
    expect(upsert).not.toContain('"verified"');
    expect(src).toContain('from("emergency_contacts").update({ active: false })');
    expect(src).toContain('action: "set_hospital_emergency_settings"');
  });

  it("sa-verify-emergency-contact: superadmin + four-eyes, executed only on proceed", () => {
    const src = fn("sa-verify-emergency-contact");
    expect(src).toContain('hasRole(caller.id, "superadmin")');
    expect(src).toContain("await requestFourEyes({");
    expect(src).toContain('targetKind: "reference_data"');
    expect(src).toContain("if (!fe.proceed) {");
    expect(src.indexOf("if (!fe.proceed) {")).toBeLessThan(
      src.indexOf('from("emergency_contacts").update('),
    );
    expect(src).toContain('action: "verify_emergency_contact"');
    expect(src).toContain("await markFourEyesExecuted(fe.pendingId)");
    expect(src).toContain("await markFourEyesFailed(fe.pendingId");
  });

  it("sa-sign-catalog-version: the registered checksum must equal the bundled CATALOG_CHECKSUM", () => {
    const src = fn("sa-sign-catalog-version");
    expect(src).toContain(
      'import { CATALOG, CATALOG_CHECKSUM } from "../_shared/symptom-catalog/index.ts";',
    );
    expect(src).toContain("version.checksum !== CATALOG_CHECKSUM");
    expect(src).toContain('code: "checksum_mismatch"');
    expect(src).toContain('hasRole(caller.id, "superadmin")');
    expect(src).toContain('action: "sign_catalog_version"');
    expect(src).toContain('status: "signed"');
  });
});
