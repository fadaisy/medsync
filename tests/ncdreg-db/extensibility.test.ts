/**
 * §5.6 extensibility: adding a condition needs a catalogue record and nothing else — no migration,
 * no new screen, no new indicator code. A throwaway core module (in no file of the standard) is
 * enabled, a patient is registered for it, and a visit with its recorded control and observation is
 * captured and closed through the ordinary commands. P3 extends this file to the generic indicators
 * and the dashboard row. PGlite lane only.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import type { ConditionModule } from "@/lib/ncdreg/standard/types";
import { beforeAll, describe, expect, it } from "vitest";

import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";
import { ctxFor, enableModule, enrol, ok, refused, run } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

export const THROWAWAY: ConditionModule = {
  version: "test-1",
  status: "draft",
  effective_from: "2026-10-05",
  code: "zz_throwaway_condition",
  label: "Throwaway condition",
  level: "core",
  subtypes: [{ code: "unknown", label: "Unknown" }],
  basis_of_diagnosis: [{ code: "unknown", label: "Unknown" }],
  diagnosis_codes: [],
  medicine_groups: [],
  visit_fields: [
    {
      code: "flares_since_last_visit",
      label: "Flares",
      type: "integer",
      requirement: "offered",
      storage: "observation",
    },
  ],
  outcome_classification: { kind: "clinician_recorded" },
  review_components: [],
  outcome_label: "Recorded as controlled",
  admission_reasons: [{ code: "zz_flare", label: "Flare" }],
  event_types: [],
  sms_banned_terms: ["throwaway"],
  enabled_by_default: false,
};
export const CATALOGUE = [...CONDITION_CATALOGUE, THROWAWAY];

describe.skipIf(!laneOn)("a new condition needs only a catalogue record", () => {
  let lane: Lane;
  let f: NcdFacility;
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Extensibility facility");
    await enableModule((s, p) => lane.pg.query(s, p), f.facilityId, THROWAWAY);
  }, 120_000);

  it("registers, captures and closes a visit for the throwaway module", async () => {
    const clin = await ctxFor(lane.db, f, "clinician", { catalogue: CATALOGUE });
    const { personId, registrations } = await enrol(clin, {
      conditions: [
        { condition: "hypertension" },
        { condition: THROWAWAY.code, registrationDate: "2026-10-05" },
      ],
    });
    const zz = registrations[1]!.registrationId;
    const visitId = randomUUID();
    await ok(clin, "visit.arrive", { visitId, personId, visitType: "scheduled" });
    await ok(clin, "visit.save_nurse", { visitId, personId, weightKg: 70, bp: [[130, 80]] });
    // Closing without the module's recorded control is refused (§5.6).
    refused(
      await run(clin, "visit.close", { visitId, personId, nextAppointmentDate: "2026-11-30" }),
      "invalid",
    );
    // An observation the module does not define is refused (B9).
    refused(
      await run(clin, "visit.save_clinician", {
        visitId,
        personId,
        conditionFields: [{ registrationId: zz, observations: { seizures_since_last_visit: 1 } }],
      }),
      "invalid",
    );
    await ok(clin, "visit.close", {
      visitId,
      personId,
      nextAppointmentDate: "2026-11-30",
      conditionFields: [
        {
          registrationId: zz,
          recordedControl: "partly_controlled",
          observations: { flares_since_last_visit: 2 },
        },
      ],
    });
    const { rows } = await lane.pg.query<{
      code: string;
      value_text: string | null;
      value_num: string | null;
    }>(
      `SELECT code, value_text, value_num::text FROM public.ncd_observation WHERE visit_id = $1 ORDER BY code`,
      [visitId],
    );
    expect(rows).toEqual([
      { code: "flares_since_last_visit", value_text: null, value_num: "2" },
      { code: "recorded_control", value_text: "partly_controlled", value_num: null },
    ]);
  });

  it("the throwaway module's admission reason is accepted; an unknown one is not", async () => {
    const clin = await ctxFor(lane.db, f, "clinician", { catalogue: CATALOGUE });
    const { personId } = await enrol(clin, { conditions: [{ condition: THROWAWAY.code }] });
    await ok(clin, "event.record", {
      eventId: randomUUID(),
      personId,
      type: "admission",
      eventDate: "2026-10-01",
      reportingUnit: "medical_ward",
      admissionReason: "zz_flare",
    });
    refused(
      await run(clin, "event.record", {
        eventId: randomUUID(),
        personId,
        type: "admission",
        eventDate: "2026-10-01",
        reportingUnit: "medical_ward",
        admissionReason: "acute_asthma",
      }),
      "invalid",
    );
  });

  it("a module the facility has not enabled cannot be registered", async () => {
    const clin = await ctxFor(lane.db, f, "clinician", { catalogue: CATALOGUE });
    await expect(enrol(clin, { conditions: [{ condition: "asthma" }] })).rejects.toThrow(
      /not enabled/,
    );
  });
});
