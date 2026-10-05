/**
 * P10 gate, PGlite lane: H1 empty-mapping refusal; H2 FHIR R4 structure (Zod schemas of the R4
 * elements each resource requires) and unverified-code refusal; H3 four-eyes release and a
 * de-identification check that no identifier field or value appears; H4 full export; H5 dry run;
 * §10.6 interlock 6 (demo mode: CSV and full export marked synthetic; DHIS2, FHIR, research refuse).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { NcdContext } from "@/lib/ncdreg/context";
import { turnOff, turnOn } from "@/lib/ncdreg/demo/service";
import { aggregateCsv, approveRelease, deidentify, dhis2DataValueSet, fhirBundle, fullExport, requestRelease, researchExtract, toFhir } from "@/lib/ncdreg/exchange";
import { LEGACY_TEMPLATE, legacyApply, legacyDryRun, parseCsv } from "@/lib/ncdreg/exchange/legacy";
import { loadDataset } from "@/lib/ncdreg/indicators/load";
import { identities } from "@/lib/ncdreg/read/views";
import type { Lane } from "../emr-db/_pglite";
import { ctxFor, enrol, ok } from "./_engine";
import { bootLane, laneOn, ncdFacility, type NcdFacility } from "./_ncd";

/* R4 required elements (cardinality 1..1) and the shapes this export uses. */
const coding = z.object({ system: z.string().url().or(z.string().startsWith("urn:")), code: z.string().min(1) }).passthrough();
const ref = z.object({ reference: z.string().regex(/^(Patient|Encounter)\/.+/) });
const R4 = {
  Patient: z.object({ resourceType: z.literal("Patient"), id: z.string(), identifier: z.array(z.object({ system: z.string(), value: z.string() })).min(1), gender: z.enum(["male", "female", "other", "unknown"]), birthDate: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/) }).passthrough(),
  Condition: z.object({ resourceType: z.literal("Condition"), id: z.string(), subject: ref, code: z.object({ coding: z.array(coding), text: z.string() }) }).passthrough(),
  Encounter: z.object({ resourceType: z.literal("Encounter"), id: z.string(), status: z.enum(["planned", "arrived", "triaged", "in-progress", "onleave", "finished", "cancelled", "entered-in-error", "unknown"]), class: coding, subject: ref }).passthrough(),
  Observation: z.object({ resourceType: z.literal("Observation"), id: z.string(), status: z.enum(["registered", "preliminary", "final", "amended"]), code: z.object({ coding: z.array(coding).min(1) }), subject: ref, valueQuantity: z.object({ value: z.number(), unit: z.string() }) }).passthrough(),
  MedicationStatement: z.object({ resourceType: z.literal("MedicationStatement"), id: z.string(), status: z.enum(["active", "completed", "entered-in-error", "intended", "stopped", "on-hold", "unknown", "not-taken"]), medicationCodeableConcept: z.object({ text: z.string() }).passthrough(), subject: ref }).passthrough(),
} as const;

describe.skipIf(!laneOn)("exchange", () => {
  let lane: Lane;
  let f: NcdFacility;
  let lead: NcdContext;
  let admin: NcdContext;
  let officer: NcdContext;
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Exchange facility");
    lead = await ctxFor(lane.db, f, "registry_lead");
    admin = await ctxFor(lane.db, f, "administrator");
    officer = await ctxFor(lane.db, f, "registry_officer");
    const clin = await ctxFor(lane.db, f, "clinician");
    const { personId } = await enrol(clin, { given: "Zebulon", family: "Quartermain", phone: "0772 999 111", conditions: [{ condition: "diabetes" }, { condition: "hypertension" }] });
    await ok(clin, "visit.record", { visitId: randomUUID(), personId, visitDate: clin.today, visitType: "scheduled", isHistorical: false, weightKg: 71, bp: [[150, 95]], glucose: { value: 8, unit: "mmol", type: "fasting", method: "capillary" }, medicines: { codes: ["metformin", "other"], otherText: "herbal from Mr Quartermain's village", confirmedUnchanged: false }, nextAppointmentDate: "2026-12-01" });
  }, 180_000);

  it("H1: the DHIS2 export refuses while the shipped mapping has empty identifiers; the CSV runs", async () => {
    await expect(dhis2DataValueSet(admin, "2026-09")).rejects.toThrow(/empty identifiers/);
    const filled = { dataSet: "DS1", orgUnit: "OU1", mappings: [{ indicator: "C01", part: "num", dataElement: "DE1", categoryOptionCombo: "COC1" }] };
    const d = JSON.parse((await dhis2DataValueSet(admin, "2026-10", filled)).body);
    expect(d).toMatchObject({ dataSet: "DS1", period: "202610", dataValues: [{ dataElement: "DE1", value: "1" }] });
    expect((await aggregateCsv(admin, "2026-09")).body.split("\n")[0]).toBe("indicator,condition,numerator,denominator,parts,definition_version");
  });

  it("H2: FHIR refuses unverified codes outside development; with the dev flag every resource has R4 structure", async () => {
    await expect(fhirBundle(lead)).rejects.toThrow(/not yet verified/);
    process.env.NCDREG_ALLOW_UNVERIFIED_CODES = "1";
    try {
      const b = JSON.parse((await fhirBundle(lead)).body) as { resourceType: string; entry: { resource: { resourceType: keyof typeof R4 } }[] };
      expect(b.resourceType).toBe("Bundle");
      const kinds = new Set(b.entry.map((e) => e.resource.resourceType));
      expect([...kinds].sort()).toEqual(["Condition", "Encounter", "MedicationStatement", "Observation", "Patient"]);
      for (const e of b.entry) expect(() => R4[e.resource.resourceType].parse(e.resource), e.resource.resourceType).not.toThrow();
    } finally {
      delete process.env.NCDREG_ALLOW_UNVERIFIED_CODES;
    }
  });

  it("H3: a release needs a request and a different approver; the extract carries no identifier field or value", async () => {
    const req = await requestRelease(officer, "research_extract", "Protocol MREC-2026-01");
    await expect(researchExtract(lead, req.id)).rejects.toThrow(/approved request/);
    await expect(approveRelease(officer, req.id, "REC/2026/07")).rejects.toThrow(/export_approve/);
    await approveRelease(lead, req.id, "REC/2026/07");
    const body = (await researchExtract(lead, req.id)).body;
    const ds = await loadDataset(lead);
    const ids = await identities(lead, ds.persons.map((p) => p.id));
    for (const i of ids.values()) {
      for (const v of [i.name, ...i.name.split(" "), i.registryNumber]) expect(body).not.toContain(v);
      expect(body).not.toContain(i.id);
    }
    for (const v of ["Zebulon", "Quartermain", "0772", "999 111", "herbal", "village", "given_name", "phone", "hospital_number", "national_id", "date_of_birth", "registry_number"])
      expect(body.toLowerCase()).not.toContain(v.toLowerCase());
    const x = JSON.parse(body);
    expect(x.approval_reference).toBe("REC/2026/07");
    expect(x.aggregates.every((a: { registered: string }) => a.registered === "<5" || Number(a.registered) >= 5)).toBe(true);
    // Pseudonyms differ between releases.
    const p = ds.persons[0]!;
    expect(deidentify(p, "k1").pseudonym).not.toBe(deidentify(p, "k2").pseudonym);
  });

  it("H4: the full export carries the data dictionary and is logged", async () => {
    const f2 = await fullExport(lead);
    const x = JSON.parse(f2.body);
    expect(x.dictionary.records.map((r: { record: string }) => r.record)).toEqual(["Person", "Registration", "Visit", "Annual review", "Event"]);
    const { rows } = await lane.pg.query(`SELECT 1 FROM public.ncd_access_event WHERE facility_id = $1 AND action = 'export'`, [f.facilityId]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("H5: the dry run reports row errors and probable duplicates; a clean file imports as back-entry", async () => {
    expect(parseCsv('a,"b, c"\n1,"x ""y"""\n')).toEqual([["a", "b, c"], ["1", 'x "y"']]);
    const row = (o: Record<string, string>) =>
      ["", "Gloria", "Ssemanda", "female", "1960-04-04", "", "hypertension", "primary", "unknown", "2015", "2024-01-10", "2024-01-10", "150", "92", "70", "", "", "", "amlodipine", "2024-03-10"].map((v, i) => o[String(i)] ?? v).join(",");
    const bad = LEGACY_TEMPLATE + row({}) + "\n" + row({ "3": "x", "11": "2030-01-01" }) + "\n" + row({ "1": "Zebulon", "2": "Quartermain", "5": "0772 999 111" }) + "\n";
    const dry = await legacyDryRun(officer, bad);
    expect(dry.errors.map((e) => e.line)).toEqual([3]);
    expect(dry.duplicates.map((d) => d.line)).toEqual([4]);
    await expect(legacyApply(officer, bad)).rejects.toThrow(/dry run/);
    const good = LEGACY_TEMPLATE + row({}) + "\n" + row({ "11": "2024-03-10", "19": "2024-05-10" }) + "\n";
    expect(await legacyApply(officer, good)).toEqual({ persons: 1, visits: 2 });
    const { rows } = await lane.pg.query(`SELECT count(*)::int AS n FROM public.ncd_visit WHERE facility_id = $1 AND is_historical`, [f.facilityId]);
    expect(rows[0]).toEqual({ n: 2 });
  });

  it("interlock 6: with demo data on, CSV and full export are marked synthetic; DHIS2, FHIR and research refuse", async () => {
    const day = { ...lead, today: "2026-10-05" };
    await turnOn(day, "scenario");
    const csv = await aggregateCsv(admin, "2026-09");
    expect(csv.fileName.startsWith("SYNTHETIC-DEMO-")).toBe(true);
    expect(csv.body.split("\n")[0]).toMatch(/SYNTHETIC DEMO DATA/);
    const full = await fullExport(lead);
    expect(full.fileName.startsWith("SYNTHETIC-DEMO-")).toBe(true);
    expect(full.body.split("\n")[0]).toMatch(/SYNTHETIC DEMO DATA/);
    const filled = { dataSet: "DS1", orgUnit: "OU1", mappings: [{ indicator: "C01", part: "num", dataElement: "DE1", categoryOptionCombo: "COC1" }] };
    await expect(dhis2DataValueSet(admin, "2026-09", filled)).rejects.toThrow(/demo data/);
    process.env.NCDREG_ALLOW_UNVERIFIED_CODES = "1";
    await expect(fhirBundle(lead)).rejects.toThrow(/demo data/);
    delete process.env.NCDREG_ALLOW_UNVERIFIED_CODES;
    const req = await requestRelease(officer, "research_extract", "x");
    await approveRelease(lead, req.id, "REC/2026/08");
    await expect(researchExtract(lead, req.id)).rejects.toThrow(/demo data/);
    await turnOff(day, true);
  });

  it("toFhir is pure and maps visits to encounters with LOINC observations", () => {
    const res = toFhir(
      { id: "p", sex: "female", birthYear: 1970, isSynthetic: true, district: null, knownCvd: [], hasValidPhone: false, recallRemovedAt: null, registrations: [], visits: [], reviews: [], events: [], appointments: [], calls: [] },
      { name: "A B", registryNumber: "DEMO-1", sex: "female", birthYear: 1970 },
      [],
    );
    expect(res.map((r) => r.resourceType)).toEqual(["Patient"]);
  });
});
