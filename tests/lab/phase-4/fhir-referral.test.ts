import type { ReferralBundleInput } from "@/lib/emr/fhir";
import { describe, expect, it } from "vitest";

import { checkR4Structure, NATIONAL, referralBundle, referralSystems } from "@/lib/emr/fhir";
import { fhirReceive } from "@/lib/exchange/adapter";

/** Lab Phase 4 Step 3: FHIR R4 out and in (FX-1..FX-7, EX-10). Every identifier and value is synthetic. */
const H = "11111111-1111-1111-1111-111111111111";
const P = "22222222-2222-2222-2222-222222222222";
const sys = referralSystems(H, P);
const input = (o: Partial<ReferralBundleInput> = {}): ReferralBundleInput => ({
  hospitalId: H,
  facilityCode: null,
  referral: { id: "rf-1", number: "RF-2026-0312" },
  partner: { id: P, name: "Reference lab A (test)" },
  code: { theirCode: "TEST-CODE", text: "Test panel" },
  specimen: {
    id: "sp-1",
    labNumber: "L00000622",
    theirIds: ["TEST-RL-1"],
    typeText: "Serum",
    collectedAt: "2026-10-13T08:41:00+03:00",
    parentId: null,
  },
  patient: { hospitalNumber: "MRN-TEST-00001", name: "Test Patient", birthDate: "2000-01-01" },
  ...o,
});
type Entry = { resource: Record<string, unknown>; request: { method: string; url: string } };
const entries = (b: Record<string, unknown>) => b.entry as Entry[];
const of = (b: Record<string, unknown>, t: string) =>
  entries(b).find((e) => e.resource.resourceType === t)!.resource;

describe("FX-1 the outbound referral Bundle", () => {
  it("FX-1 a transaction of Task, ServiceRequest, Specimen and Patient that passes the structural check", () => {
    const b = referralBundle(input());
    expect(b.type).toBe("transaction");
    expect(entries(b).map((e) => e.resource.resourceType)).toEqual([
      "Task",
      "ServiceRequest",
      "Specimen",
      "Patient",
    ]);
    expect(checkR4Structure(b)).toEqual([]);
    const task = of(b, "Task");
    expect(task).toMatchObject({
      status: "requested",
      intent: "order",
      identifier: [{ system: sys.referral, value: "RF-2026-0312" }],
    });
    expect(of(b, "Specimen").identifier).toEqual([
      { system: sys.labNumber, value: "L00000622" },
      { system: sys.partnerForm, value: "TEST-RL-1" },
    ]);
  });

  it("FX-4 LOINC only when the signed mapping holds one", () => {
    const without = of(referralBundle(input()), "ServiceRequest") as {
      code: { coding: { system: string }[] };
    };
    expect(without.code.coding.map((c) => c.system)).toEqual([sys.partnerTests]);
    const withLoinc = of(
      referralBundle(input({ code: { theirCode: "TEST-CODE", loinc: "00000-0", text: "Test" } })),
      "ServiceRequest",
    ) as {
      code: { coding: { system: string }[] };
    };
    expect(withLoinc.code.coding.map((c) => c.system)).toEqual([
      sys.partnerTests,
      "http://loinc.org",
    ]);
  });

  it("S37 PT-3 the Patient carries only the fields passed (the signed list); no telecom or address ever", () => {
    const b = referralBundle(input({ patient: { hospitalNumber: "MRN-TEST-00001" } }));
    expect(Object.keys(of(b, "Patient")).sort()).toEqual(["id", "identifier", "resourceType"]);
    const text = JSON.stringify(b);
    expect(text).not.toMatch(/telecom|address|Test Patient|2000-01-01/);
  });

  it("FX-5, FX-6 the NIN and the facility code use the national systems, only when given", () => {
    const b = referralBundle(
      input({ facilityCode: "TEST-ORGUNIT", patient: { nin: "CM0000TEST0001" } }),
    );
    expect(of(b, "Patient").identifier).toEqual([
      { system: NATIONAL.nin, value: "CM0000TEST0001" },
    ]);
    expect(of(b, "Task").requester).toEqual({
      identifier: { system: NATIONAL.facility, value: "TEST-ORGUNIT" },
    });
  });

  it("RF-2 an aliquot points at its parent specimen", () => {
    const b = referralBundle(input({ specimen: { ...input().specimen, parentId: "sp-parent" } }));
    expect(of(b, "Specimen").parent).toEqual([{ reference: "Specimen/sp-parent" }]);
    expect(checkR4Structure(b)).toEqual([]);
  });

  it("FX-7 the structural check finds a broken resource (it is not a full validator)", () => {
    const b = referralBundle(input()) as unknown as { entry: Entry[] };
    b.entry[0]!.resource.status = "sent";
    b.entry[3]!.resource.telecom = [{ value: "+256 700 000 001" }];
    expect(checkR4Structure(b)).toEqual([
      "entry[0] Task.status",
      "entry[3] Patient.telecom must not be sent",
    ]);
    expect(checkR4Structure({ resourceType: "Patient" })).toEqual(["not a Bundle"]);
  });
});

describe("FX-2, FX-3 inbound", () => {
  const systems = { referralSystem: sys.referral, formSystem: sys.partnerForm };
  const result = {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        resource: {
          resourceType: "Task",
          id: "t1",
          status: "completed",
          intent: "order",
          identifier: [{ system: sys.referral, value: "RF-2026-0312" }],
        },
      },
      {
        resource: {
          resourceType: "Patient",
          id: "p1",
          name: [{ text: "Test Patient" }],
          birthDate: "2000-01-01",
        },
      },
      {
        resource: {
          resourceType: "DiagnosticReport",
          id: "r1",
          status: "final",
          code: { text: "Test panel" },
          identifier: [{ system: "urn:test:report", value: "TEST-RPT-1" }],
          specimen: [{ identifier: { system: sys.partnerForm, value: "TEST-RL-1" } }],
          issued: "2026-10-14T16:05:00+03:00",
          result: [{ reference: "Observation/o1" }],
        },
      },
      {
        resource: {
          resourceType: "Observation",
          id: "o1",
          status: "final",
          code: { coding: [{ system: sys.partnerTests, code: "TEST-CODE" }] },
          valueQuantity: {
            value: 1.5,
            unit: "test-unit",
            system: "http://unitsofmeasure.org",
            code: "test-unit",
          },
          referenceRange: [{ text: "1-2" }],
        },
      },
    ],
  };

  it("FX-3 a result Bundle parses to our referral number, their form number, demographics and components", () => {
    const [p] = fhirReceive(JSON.stringify(result), systems);
    expect(p).toMatchObject({
      kind: "result",
      referralNumber: "RF-2026-0312",
      result: {
        identifiers: { theirNumber: "TEST-RL-1" },
        patient: { name: "Test Patient", birthDate: "2000-01-01" },
        report: { number: "TEST-RPT-1", status: "final" },
        components: [
          {
            key: "o1",
            code: "TEST-CODE",
            value: "1.5",
            unit: "test-unit",
            ucum: "test-unit",
            rangeText: "1-2",
          },
        ],
        conformant: true,
      },
    });
  });

  it("FX-7 a non-conformant but profiled message (H5 style) is accepted and flagged", () => {
    const odd = structuredClone(result) as { entry: { resource: Record<string, unknown> }[] };
    odd.entry[2]!.resource.locationCode = "TEST";
    odd.entry[2]!.resource.performerType = "????";
    const [p] = fhirReceive(JSON.stringify(odd), systems);
    expect(p).toMatchObject({ kind: "result", result: { conformant: false } });
  });

  it("FX-2 a Task-only message is a status update with its time", () => {
    const status = {
      resourceType: "Task",
      id: "t1",
      status: "in-progress",
      intent: "order",
      identifier: [{ system: sys.referral, value: "RF-2026-0312" }],
      businessStatus: { text: "testing" },
      lastModified: "2026-10-13T15:00:00+03:00",
    };
    expect(fhirReceive(JSON.stringify(status), systems)).toEqual([
      {
        kind: "status",
        update: {
          referralNumber: "RF-2026-0312",
          status: "in-progress",
          businessStatus: "testing",
          statusReason: undefined,
          eventAt: new Date("2026-10-13T12:00:00Z"),
        },
      },
    ]);
  });

  it("EX-5 unreadable messages say why (and are stored as unreadable, never dropped)", () => {
    expect(fhirReceive("not json", systems)).toEqual([{ kind: "unreadable", error: "not JSON" }]);
    expect(fhirReceive(JSON.stringify({ resourceType: "Bundle", entry: [] }), systems)).toEqual([
      { kind: "unreadable", error: "no resources" },
    ]);
    expect(
      fhirReceive(
        JSON.stringify({
          resourceType: "Task",
          status: "nonsense",
          identifier: [{ system: sys.referral, value: "RF-1" }],
          lastModified: "2026-10-13T15:00:00Z",
        }),
        systems,
      ),
    ).toEqual([{ kind: "unreadable", error: "Task.status" }]);
  });
});
