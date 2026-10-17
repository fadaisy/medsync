import type { ReferralCandidate, SpecimenCandidate } from "@/lib/exchange/match";
import type { InboundResult } from "@/lib/exchange/types";
import { describe, expect, it } from "vitest";

import {
  fileAfterConfirmingErrors,
  matchAnalyserResult,
  matchPartnerResult,
  notOurs,
} from "@/lib/exchange/match";
import { compare, normaliseDate, normaliseId, normaliseName } from "@/lib/exchange/normalise";
import { MATCH_REASONS } from "@/lib/exchange/types";

/** Lab Phase 4 Step 3: normalisation and the matching rule (MA-1..MA-9, gate-a §6). Every value is synthetic. */
const A = "hospital-a";
const B = "hospital-b";
const ref = (o: Partial<ReferralCandidate> = {}): ReferralCandidate => ({
  referralId: "rf-0312",
  hospitalId: A,
  theirNumbers: ["TEST-RL-1"],
  labNumber: "L00000622",
  open: true,
  patient: {
    name: "Test Patient Alpha",
    birthDate: "2000-01-01",
    hospitalNumber: "MRN-TEST-00001",
  },
  ...o,
});
const result = (o: Partial<InboundResult> = {}): InboundResult => ({
  identifiers: { theirNumber: "TEST-RL-1" },
  patient: { name: "ALPHA, Test Patient", birthDate: "2000-01-01" },
  components: [{ key: "c1", code: "TEST-CODE", value: "1", unit: "test-unit" }],
  conformant: true,
  ...o,
});
const ctx = { hospitalId: A, partnerEnabled: true };

describe("normalisation (gate-a §6)", () => {
  it("names: case, punctuation, spacing and order", () => {
    expect(normaliseName("ALPHA, Test Patient")).toBe(normaliseName("test   patient alpha"));
    expect(normaliseName("  ")).toBeNull();
  });

  it("identifiers: case, spaces and hyphens", () => {
    expect(normaliseId(" test-rl 1 ")).toBe("TESTRL1");
  });

  it("dates: ISO, compact, DD/MM/YYYY and DD MMM YYYY; impossible or unreadable dates cannot be compared", () => {
    for (const d of ["2000-01-01", "20000101", "01/01/2000", "1 Jan 2000", "01 JAN 2000"])
      expect(normaliseDate(d), d).toBe("2000-01-01");
    expect(normaliseDate("31/02/2000")).toBeNull();
    expect(normaliseDate("Jan 1, 2000")).toBeNull();
    expect(compare(normaliseDate("02/31/2000"), "2000-01-01")).toBe("cannot_compare");
  });

  it("near misses that must NOT match", () => {
    const base = normaliseName("Test Patient Alpha");
    for (const n of [
      "Test Patient Alphb",
      "Test Patient",
      "Test Patient Alpha Extra",
      "Tst Patient Alpha",
      "Test Patients Alpha",
    ])
      expect(compare(normaliseName(n), base), n).toBe("differs");
    expect(compare(normaliseDate("02/03/2000"), normaliseDate("03/02/2000"))).toBe("differs"); // day and month swapped
    expect(compare(normaliseDate("2001-01-01"), normaliseDate("2000-01-01"))).toBe("differs");
  });
});

describe("MA-1: a partner's result", () => {
  it("MA-1 files by itself on one open referral when name and date of birth agree", () => {
    expect(matchPartnerResult(result(), [ref()], ctx)).toEqual({ file: "rf-0312" });
  });

  it("MA-1 files by itself when the hospital number agrees (no name sent)", () => {
    const r = result({ patient: { hospitalNumber: "mrn test 00001" } });
    expect(matchPartnerResult(r, [ref()], ctx)).toEqual({ file: "rf-0312" });
  });

  it("MA-1 our lab number echoed back maps too", () => {
    const r = result({ identifiers: { labNumber: "l00000622" } });
    expect(matchPartnerResult(r, [ref()], ctx)).toEqual({ file: "rf-0312" });
  });

  it("MA-3 not_found: no open referral has that number", () => {
    expect(
      matchPartnerResult(result({ identifiers: { theirNumber: "TEST-RL-9" } }), [ref()], ctx),
    ).toMatchObject({
      wait: "not_found",
    });
  });

  it("MA-3 not_found: a closed referral is not a candidate", () => {
    expect(matchPartnerResult(result(), [ref({ open: false })], ctx)).toMatchObject({
      wait: "not_found",
    });
  });

  it("S32 MA-3 demographics_disagree: the number maps, the name differs, no hospital number", () => {
    const out = matchPartnerResult(
      result({ patient: { name: "Test Patient Bravo", birthDate: "2000-01-01" } }),
      [ref()],
      ctx,
    );
    expect(out).toMatchObject({ wait: "demographics_disagree", candidate: "rf-0312" });
    expect("comparison" in out && out.comparison).toContainEqual({
      check: "name",
      outcome: "differs",
    });
  });

  it("MA-3 demographics_disagree: nothing to compare", () => {
    expect(matchPartnerResult(result({ patient: undefined }), [ref()], ctx)).toMatchObject({
      wait: "demographics_disagree",
    });
  });

  it("S33 MA-3 ambiguous: two open referrals share the number; nothing is picked", () => {
    const out = matchPartnerResult(result(), [ref(), ref({ referralId: "rf-0313" })], ctx);
    expect(out).toEqual({
      wait: "ambiguous",
      candidate: null,
      comparison: [{ check: "their_number", outcome: "same" }],
    });
  });

  it("MA-3 partner_not_enabled", () => {
    expect(matchPartnerResult(result(), [ref()], { ...ctx, partnerEnabled: false })).toMatchObject({
      wait: "partner_not_enabled",
    });
  });

  it("MA-1 a referral in another hospital never matches", () => {
    expect(matchPartnerResult(result(), [ref({ hospitalId: B })], ctx)).toMatchObject({
      wait: "not_found",
    });
  });

  it("MA-5 the comparison carries outcomes only, never the values", () => {
    const out = matchPartnerResult(
      result({ patient: { name: "Test Patient Bravo", birthDate: "2000-01-01" } }),
      [ref()],
      ctx,
    );
    const text = JSON.stringify(out);
    for (const v of ["Bravo", "Alpha", "2000", "MRN-TEST"]) expect(text).not.toContain(v);
  });
});

describe("MA-2, MA-8, MA-9: an analyser's result", () => {
  const spec = (o: Partial<SpecimenCandidate> = {}): SpecimenCandidate => ({
    specimenId: "sp-1",
    hospitalId: A,
    labNumber: "L00000622",
    received: true,
    components: [{ key: "test.component", released: false }],
    ...o,
  });
  const mapping = { codes: { TCODE: { component: "test.component", unit: "test-unit" } } };
  const actx = { hospitalId: A, controlLots: [{ lotId: "lot-ctl", lotNumber: "QC-TEST-1" }] };
  const sample = (
    o: Partial<{ sampleId: string; code: string; unit: string | undefined }> = {},
  ) => ({
    sampleId: "L00000622",
    code: "TCODE",
    unit: "test-unit" as string | undefined,
    ...o,
  });

  it("MA-2 files as preliminary on one received specimen with a mapped, ordered, unreleased component", () => {
    expect(matchAnalyserResult(sample(), [spec()], mapping, actx)).toEqual({ file: "sp-1" });
  });

  it("MA-3 not_found / ambiguous / another hospital", () => {
    expect(
      matchAnalyserResult(sample({ sampleId: "L00000999" }), [spec()], mapping, actx),
    ).toMatchObject({ wait: "not_found" });
    expect(
      matchAnalyserResult(sample(), [spec(), spec({ specimenId: "sp-2" })], mapping, actx),
    ).toMatchObject({ wait: "ambiguous" });
    expect(matchAnalyserResult(sample(), [spec({ hospitalId: B })], mapping, actx)).toMatchObject({
      wait: "not_found",
    });
  });

  it("S44 MA-3 not_received, and MA-9 re-running after receipt files it", () => {
    expect(matchAnalyserResult(sample(), [spec({ received: false })], mapping, actx)).toMatchObject(
      {
        wait: "not_received",
        candidate: "sp-1",
      },
    );
    expect(matchAnalyserResult(sample(), [spec({ received: true })], mapping, actx)).toEqual({
      file: "sp-1",
    });
  });

  it("S45 MA-3 code_unmapped and unit_differs never reach a patient", () => {
    expect(matchAnalyserResult(sample({ code: "XYZ" }), [spec()], mapping, actx)).toMatchObject({
      wait: "code_unmapped",
    });
    expect(
      matchAnalyserResult(sample({ unit: "other-unit" }), [spec()], mapping, actx),
    ).toMatchObject({ wait: "unit_differs" });
    expect(matchAnalyserResult(sample({ unit: undefined }), [spec()], mapping, actx)).toMatchObject(
      { wait: "unit_differs" },
    );
  });

  it("MA-3 not_ordered and already_released", () => {
    const other = spec({ components: [{ key: "test.other", released: false }] });
    expect(matchAnalyserResult(sample(), [other], mapping, actx)).toMatchObject({
      wait: "not_ordered",
    });
    const released = spec({ components: [{ key: "test.component", released: true }] });
    expect(matchAnalyserResult(sample(), [released], mapping, actx)).toMatchObject({
      wait: "already_released",
    });
  });

  it("S46 MA-8 a registered control lot goes to QC, never a patient; an unregistered QC id waits", () => {
    expect(matchAnalyserResult(sample({ sampleId: "qc-test-1" }), [spec()], mapping, actx)).toEqual(
      { qc: "lot-ctl" },
    );
    expect(
      matchAnalyserResult(sample({ sampleId: "QC-TEST-2" }), [spec()], mapping, actx),
    ).toMatchObject({ wait: "not_found" });
  });
});

describe("MA-4, MA-6, MA-7", () => {
  it("MA-3 nine reason codes", () => {
    expect(MATCH_REASONS).toHaveLength(9);
  });

  it("S34 MA-4 no outcome ever creates or picks: the only keys are file, qc or wait", () => {
    const outs = [
      matchPartnerResult(result(), [ref(), ref({ referralId: "x" })], ctx),
      matchPartnerResult(result(), [], ctx),
      matchPartnerResult(result({ patient: undefined }), [ref()], ctx),
      matchAnalyserResult(
        { sampleId: "nope", code: "x", unit: "x" },
        [],
        { codes: {} },
        { hospitalId: A, controlLots: [] },
      ),
    ];
    for (const o of outs) {
      const keys = Object.keys(o);
      expect(keys.some((k) => ["file", "qc", "wait"].includes(k))).toBe(true);
      expect(keys.filter((k) => /create|new|pick|closest/i.test(k))).toEqual([]);
    }
  });

  it("MA-6 filing after a mismatch needs permission, a method, who was spoken to, a second person and a reason", () => {
    const ok = {
      hasPermission: true,
      method: "phone_call" as const,
      spokeTo: "Reference lab duty officer (test)",
      secondUserId: "u2",
      actorUserId: "u1",
      reason: "Confirmed by phone",
    };
    expect(fileAfterConfirmingErrors(ok)).toEqual([]);
    expect(fileAfterConfirmingErrors({ ...ok, spokeTo: "" })).toEqual(["spoke_to"]);
    expect(fileAfterConfirmingErrors({ ...ok, secondUserId: "u1" })).toEqual(["second_person"]);
    expect(
      fileAfterConfirmingErrors({ ...ok, hasPermission: false, method: null, reason: "" }),
    ).toEqual(["permission", "method", "reason"]);
    expect(fileAfterConfirmingErrors({ ...ok, method: "corrected_report", spokeTo: null })).toEqual(
      [],
    );
  });

  it("MA-7 not ours keeps the message and tells the partner where a channel exists", () => {
    expect(notOurs(true)).toEqual({ keepMessage: true, notify: "message" });
    expect(notOurs(false)).toEqual({ keepMessage: true, notify: "call_note" });
  });
});
