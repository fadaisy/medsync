import "server-only";

import type { EntryComponent } from "@/components/emr/results/model";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { admissions } from "@/db/schema/admissions";
import { devices, testCatalogue } from "@/db/schema/emr";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { poctLots } from "@/db/schema/lab-catalogue";
import { entryComponents } from "@/lib/emr/read/results";
import { componentsFor } from "@/lib/lab/catalogue-v2";
import { currentMeasures } from "@/lib/lab/units";

export interface BedsideTest {
  code: string;
  display: string;
  /** Glucose asks when the patient last ate (PC-7); the answer picks the concept on the server. */
  glucose: boolean;
  components: EntryComponent[];
  devices: { id: string; label: string; lots: { id: string; lot: string; useBy: string }[] }[];
}

const OPEN_ADMISSION = ["awaiting_bed", "bed_allocated", "arrived"];

/**
 * The bedside form's data (Lab Phase 2 §5.7): the patient's ward from the open admission here, and the
 * tests that have a device in use on that ward or hospital-wide (a device not verified yet is never
 * listed, D-LAB2-11), each with its devices, their lots and the components to enter.
 */
export async function loadBedsideForm(hospitalId: string, patientUserId: string) {
  const tx = db as unknown as EmrTx;
  const [ward] = await tx
    .select({ id: hospitalWards.id, name: hospitalWards.name })
    .from(admissions)
    .innerJoin(hospitalWards, eq(hospitalWards.id, admissions.wardId))
    .where(
      and(
        eq(admissions.hospitalId, hospitalId),
        eq(admissions.patientUserId, patientUserId),
        inArray(admissions.status, OPEN_ADMISSION),
      ),
    )
    .limit(1);
  const devs = await tx
    .select({
      id: devices.id,
      model: devices.model,
      serial: devices.serial,
      testCode: devices.testCode,
    })
    .from(devices)
    .where(
      and(
        eq(devices.hospitalId, hospitalId),
        eq(devices.state, "in_use"),
        isNotNull(devices.testCode),
        ward ? or(isNull(devices.wardId), eq(devices.wardId, ward.id)) : isNull(devices.wardId),
      ),
    )
    .orderBy(devices.model);
  if (devs.length === 0) return { ward: ward ?? null, tests: [] as BedsideTest[] };

  const [lots, tests] = await Promise.all([
    tx
      .select({
        id: poctLots.id,
        deviceId: poctLots.deviceId,
        lot: poctLots.lot,
        useBy: poctLots.useBy,
      })
      .from(poctLots)
      .where(
        inArray(
          poctLots.deviceId,
          devs.map((d) => d.id),
        ),
      )
      .orderBy(desc(poctLots.useBy)),
    tx
      .select({
        id: testCatalogue.id,
        code: testCatalogue.code,
        display: testCatalogue.display,
        components: testCatalogue.components,
        defaultUnits: testCatalogue.defaultUnits,
      })
      .from(testCatalogue)
      .where(
        and(
          isNull(testCatalogue.hospitalId),
          inArray(testCatalogue.code, [...new Set(devs.map((d) => d.testCode!))]),
        ),
      )
      .orderBy(testCatalogue.display),
  ]);

  const out: BedsideTest[] = [];
  for (const t of tests) {
    const { components } = await componentsFor(tx, hospitalId, t, null, "clinician");
    const measures = await currentMeasures(tx, hospitalId, t.id);
    const glucose = components.includes("obs.glucose");
    out.push({
      code: t.code,
      display: t.display,
      glucose,
      // PC-7: one glucose value; the fasting answer chooses obs.glucose_fasting on the server.
      components: entryComponents({
        components: components.filter((c) => !(glucose && c === "obs.glucose_fasting")),
        defaultUnits: t.defaultUnits,
      }).map((c) => {
        const m = measures.get(c.conceptId);
        return { ...c, defaultUnit: m?.unitDisplay ?? m?.unitUcum ?? c.defaultUnit };
      }),
      devices: devs
        .filter((d) => d.testCode === t.code)
        .map((d) => ({
          id: d.id,
          label: d.serial ? `${d.model} · ${d.serial}` : d.model,
          lots: lots
            .filter((l) => l.deviceId === d.id)
            .map((l) => ({ id: l.id, lot: l.lot, useBy: l.useBy })),
        })),
    });
  }
  return { ward: ward ?? null, tests: out };
}
