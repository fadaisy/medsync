/**
 * §5.6 extensibility: adding a condition needs a catalogue record and nothing else — no migration,
 * no new screen, no new indicator code. A throwaway core module (in no file of the standard) is
 * enabled, a patient is registered for it, and a visit with its recorded control and observation is
 * captured and closed through the ordinary commands. P3 extends this file to the generic indicators
 * and the dashboard row. PGlite lane only.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import { CATALOGUE, THROWAWAY } from "./_throwaway";
import type { NcdFacility } from "./_ncd";
import { beforeAll, describe, expect, it } from "vitest";

import { computeIndicators } from "@/lib/ncdreg/indicators/engine";
import { loadDataset } from "@/lib/ncdreg/indicators/load";
import { enabledModules } from "@/lib/ncdreg/indicators/snapshot";
import { ctxFor, enableModule, enrol, ok, refused, run } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";



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

  it("the generic indicators report the throwaway module with clinician-recorded classes", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead", {
      catalogue: CATALOGUE,
      at: "2026-12-05T09:00:00+03:00",
    });
    const enabled = await enabledModules(lead);
    expect(enabled.has(THROWAWAY.code)).toBe(true);
    const r = computeIndicators(await loadDataset(lead), {
      month: "2026-11",
      catalogue: CATALOGUE,
      enabled,
    });
    const k = (c: string) => r.results[`${c}.${THROWAWAY.code}`]!;
    expect(k("G01").num).toBe(2);
    expect(k("G02").num).toBe(1);
    // Registered in October: not before the 3-month window of November (Sep–Nov), so G04's denominator is empty…
    expect(k("G04").den).toBe(0);
    // …and in December's window the visit is the latest, so its recorded control is the class.
    const dec = computeIndicators(await loadDataset(lead), {
      month: "2027-01",
      asOf: "2027-01-31",
      catalogue: CATALOGUE,
      enabled,
    });
    expect(dec.results[`G04.${THROWAWAY.code}`]!.parts).toMatchObject({
      controlled: 0,
      partly_controlled: 0,
      not_controlled: 0,
      not_assessed: 0,
    });
    expect(Object.keys(k("G04").parts!)).toEqual([
      "controlled",
      "partly_controlled",
      "not_controlled",
      "not_assessed",
      "not_recorded",
      "no_visit",
    ]);
    expect(k("G06").parts).toEqual({
      registered: 2,
      under_care: 1,
      visit_3_months: 1,
      leading_class: 0,
    });
  });
});
