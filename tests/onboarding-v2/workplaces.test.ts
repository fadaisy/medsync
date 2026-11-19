import { describe, expect, it } from "vitest";

import { clinicalSchema, fieldErrors } from "@/lib/onboarding/schemas";
import {
  joinRefusal,
  leadAffiliation,
  MAX_EXTRA_WORKPLACES,
  workplacesOf,
} from "@/lib/onboarding/workplaces";

/** Several hospitals at sign-up (ADR 0530): one request per hospital, each reviewed on its own. */

const H1 = "11111111-1111-4111-8111-111111111111";
const H2 = "33333333-3333-4333-8333-333333333333";
const H3 = "55555555-5555-4555-8555-555555555555";
const D1 = "22222222-2222-4222-8222-222222222222";
const D2 = "44444444-4444-4444-8444-444444444444";
const D3 = "66666666-6666-4666-8666-666666666666";

const clinical = {
  fullName: "Dr Okello",
  email: "okello@example.com",
  phone: "0772 000 111",
  password: "correct horse battery 9",
  profession: "medical-officer",
  registrationNumber: "UMDPC/123",
  licence: "later",
  hospitalId: H1,
  departmentId: D1,
  employmentType: "full_time",
  consent: true,
  consentVersion: "v1.0",
  consentSha: "a".repeat(64),
} as const;
const extra = (hospitalId: string, departmentId: string, more: Record<string, string> = {}) => ({
  hospitalId,
  departmentId,
  employmentType: "visiting",
  ...more,
});
const errorFor = (moreWorkplaces: unknown) =>
  fieldErrors(clinicalSchema.safeParse({ ...clinical, moreWorkplaces }).error!).moreWorkplaces;

describe("several hospitals at sign-up: the schema", () => {
  it("one hospital still passes, as before", () => {
    expect(clinicalSchema.safeParse(clinical).success).toBe(true);
    expect(clinicalSchema.safeParse({ ...clinical, moreWorkplaces: [] }).success).toBe(true);
  });

  it("takes two more hospitals, each with its own department and employment", () => {
    const r = clinicalSchema.safeParse({
      ...clinical,
      moreWorkplaces: [extra(H2, D2), extra(H3, D3, { employmentType: "locum" })],
    });
    expect(r.success).toBe(true);
  });

  it("refuses the same hospital twice, against the first one or another extra", () => {
    expect(errorFor([extra(H1, D2)])).toMatch(/twice/);
    expect(errorFor([extra(H2, D2), extra(H2, D3)])).toMatch(/twice/);
  });

  it("an added hospital needs its hospital, department and employment", () => {
    expect(errorFor([{ hospitalId: "", departmentId: "", employmentType: "visiting" }])).toMatch(
      /hospital/i,
    );
    expect(errorFor([extra(H2, "")])).toMatch(/department/i);
    expect(errorFor([extra(H2, D2, { employmentType: "owner" })])).toMatch(/employment/i);
  });

  it("a different post at another hospital must be under the same council", () => {
    expect(
      clinicalSchema.safeParse({
        ...clinical,
        moreWorkplaces: [extra(H2, D2, { profession: "intern-doctor" })],
      }).success,
    ).toBe(true);
    expect(errorFor([extra(H2, D2, { profession: "registered-nurse" })])).toMatch(/post/i);
    expect(errorFor([extra(H2, D2, { profession: "wizard" })])).toMatch(/post/i);
  });

  it("caps the extras", () => {
    const many = Array.from({ length: MAX_EXTRA_WORKPLACES + 1 }, (_, i) =>
      extra(`${i}0000000-0000-4000-8000-000000000000`, D2),
    );
    expect(errorFor(many)).toMatch(/up to/);
  });
});

describe("several hospitals at sign-up: one request per hospital", () => {
  it("lists the first hospital, then each extra, with the main profession unless one is named", () => {
    const v = clinicalSchema.parse({
      ...clinical,
      moreWorkplaces: [extra(H2, D2), extra(H3, D3, { profession: "intern-doctor" })],
    });
    expect(workplacesOf(v)).toEqual([
      {
        hospitalId: H1,
        departmentId: D1,
        employmentType: "full_time",
        profession: "medical-officer",
      },
      {
        hospitalId: H2,
        departmentId: D2,
        employmentType: "visiting",
        profession: "medical-officer",
      },
      { hospitalId: H3, departmentId: D3, employmentType: "visiting", profession: "intern-doctor" },
    ]);
  });

  it("one hospital gives one request", () => {
    expect(workplacesOf(clinicalSchema.parse(clinical))).toHaveLength(1);
  });
});

describe("the pending page's headline follows the furthest-on hospital", () => {
  const row = (state: string) => ({ state });
  it("an approval anywhere leads, so the person can set up sign-in and start there", () => {
    expect(
      leadAffiliation([row("pending_approval"), row("approved"), row("rejected")])?.state,
    ).toBe("approved");
    expect(leadAffiliation([row("rejected"), row("active")])?.state).toBe("active");
  });
  it("then a hospital still reviewing, and a refusal only when every hospital refused", () => {
    expect(leadAffiliation([row("rejected"), row("pending_approval")])?.state).toBe(
      "pending_approval",
    );
    expect(leadAffiliation([row("rejected"), row("rejected")])?.state).toBe("rejected");
    expect(leadAffiliation([])).toBeUndefined();
  });
});

describe("adding a hospital later, from the profile", () => {
  it("is refused where the person already has a live or waiting request", () => {
    for (const state of ["pending_approval", "under_review", "approved", "active", "suspended"])
      expect(joinRefusal([{ hospitalId: H2, state }], H2)).toMatch(/already/);
  });
  it("is allowed at a new hospital, or again after a refusal or an ended post", () => {
    expect(joinRefusal([{ hospitalId: H1, state: "active" }], H2)).toBeNull();
    expect(joinRefusal([{ hospitalId: H2, state: "rejected" }], H2)).toBeNull();
    expect(joinRefusal([{ hospitalId: H2, state: "deactivated" }], H2)).toBeNull();
  });
  it("is capped at five hospitals still open", () => {
    const five = [H1, H2, H3, D1, D2].map((hospitalId) => ({ hospitalId, state: "active" }));
    expect(joinRefusal(five, D3)).toMatch(/up to/);
  });
});
