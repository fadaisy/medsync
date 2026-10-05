/**
 * G4 on the PGlite lane: the monthly audit sample is 5% of the month's visits, at least 10, drawn
 * deterministically from the seed "<facility id>:<month>", stored in ncd_audit_sample, and the
 * agreement rate is reported from the field-level checks.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import { beforeAll, describe, expect, it } from "vitest";

import {
  auditSample,
  auditSeed,
  auditSize,
  drawAuditSample,
  drawSample,
  recordAgreement,
} from "@/lib/ncdreg/quality";
import { ctxFor, enrol } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

describe("G4: the audit sample is deterministic from its seed", () => {
  const ids = Array.from({ length: 400 }, () => randomUUID());

  it("5% of the month's visits, at least 10, never more than there are", () => {
    expect(auditSize(400)).toBe(20);
    expect(auditSize(120)).toBe(10);
    expect(auditSize(4)).toBe(4);
    expect(drawSample(ids, "f:2026-09")).toHaveLength(20);
  });

  it("the same seed gives the same sample whatever the order of the visits; another seed another sample", () => {
    const a = drawSample(ids, "f:2026-09");
    const b = drawSample([...ids].reverse(), "f:2026-09");
    expect(b).toEqual(a);
    expect(drawSample(ids, "f:2026-10")).not.toEqual(a);
  });
});

describe.skipIf(!laneOn)("G4: audit sample in the database", () => {
  let lane: Lane;
  let f: NcdFacility;
  const visitIds: string[] = [];
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Audit sample facility");
    const clin = await ctxFor(lane.db, f, "clinician");
    for (let i = 0; i < 14; i++) {
      const { personId } = await enrol(clin);
      const { rows } = await lane.pg.query<{ id: string }>(
        `INSERT INTO public.ncd_visit (facility_id, person_id, visit_date, visit_type, status, stage, next_appointment_date)
         VALUES ($1, $2, $3, 'scheduled', 'closed', 'closed', '2026-12-01') RETURNING id`,
        [f.facilityId, personId, `2026-09-${String(10 + i).padStart(2, "0")}`],
      );
      visitIds.push(rows[0]!.id);
    }
  }, 180_000);

  it("draws at least 10, stores them with the seed, and a redraw reproduces the same visits", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const first = await drawAuditSample(lead, "2026-09-01");
    expect(first.seed).toBe(auditSeed(f.facilityId, "2026-09"));
    expect(first.sampled).toHaveLength(10);
    expect(first.sampled).toEqual(drawSample(visitIds, first.seed));
    const again = await drawAuditSample(lead, "2026-09-01");
    expect(again.sampled).toEqual(first.sampled);
    const stored = await auditSample(lead, "2026-09");
    expect(stored.rows.map((r) => r.visitId).sort()).toEqual([...first.sampled].sort());
    expect(stored.rows.every((r) => r.seed === first.seed)).toBe(true);
  });

  it("the agreement rate comes from field-level checks, and only data quality holders record them", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const [s1, s2] = (await auditSample(lead, "2026-09")).rows;
    await recordAgreement(lead, s1!.id, { visit_date: true, blood_pressure: true, weight: false });
    await recordAgreement(lead, s2!.id, { visit_date: true });
    const { agreement } = await auditSample(lead, "2026-09");
    expect(agreement).toEqual({ agree: 3, checked: 4, rate: 0.75 });
    const clin = await ctxFor(lane.db, f, "clinician");
    await expect(recordAgreement(clin, s1!.id, { weight: true })).rejects.toThrow(/data_quality/);
    await expect(recordAgreement(lead, s1!.id, { favourite_colour: true })).rejects.toThrow(
      /Unknown audit field/,
    );
  });
});
