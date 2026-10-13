import "server-only";

import type { EntryComponent } from "@/components/emr/results/model";
import type { EmrTx } from "@/lib/emr/db";
import type { LotState } from "@/lib/lab/stock";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { LAB3 } from "@/content/lab-phase-3";
import { db } from "@/db";
import { admissions } from "@/db/schema/admissions";
import { devices, testCatalogue } from "@/db/schema/emr";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { labLotsInUse, labStockLots } from "@/db/schema/lab-quality";
import { entryComponents } from "@/lib/emr/read/results";
import { deviceStatus } from "@/lib/lab/bedside-quality-store";
import { componentsFor } from "@/lib/lab/catalogue-v2";
import { labPoctQualityLiveFor } from "@/lib/lab/feature";
import { lotRefusal } from "@/lib/lab/stock";
import { currentMeasures } from "@/lib/lab/units";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

export interface BedsideTest {
  code: string;
  display: string;
  /** Glucose asks when the patient last ate (PC-7); the answer picks the concept on the server. */
  glucose: boolean;
  components: EntryComponent[];
  devices: {
    id: string;
    label: string;
    /** BQ-3 (Lab Phase 3 Step 8): "Control check not done today", when the day's check is due. */
    notice: string | null;
    /** BQ-1: a strip lot with no passing check on this device needs one before the next result. */
    lots: { id: string; lot: string; useBy: string | null; needsCheck: boolean }[];
  }[];
}

const OPEN_ADMISSION = ["awaiting_bed", "bed_allocated", "arrived"];

/**
 * LA-4, ST-6, ST-8 (Lab Phase 3 Step 4): only lots selectable for patients today (accepted or in use, not past
 * the use-by day, hospital-local), the one that expires first offered first (FEFO; no use-by goes last).
 */
function usableLots<L extends { state: string; useBy: string | null }>(
  lots: L[],
  now = new Date(),
) {
  return lots
    .filter(
      (l) =>
        lotRefusal({ state: l.state as LotState, useBy: l.useBy }, now, DEFAULT_TIME_ZONE) === null,
    )
    .sort((a, b) => (a.useBy ?? "9999").localeCompare(b.useBy ?? "9999"));
}

/**
 * The bedside form's data (Lab Phase 2 §5.7): the patient's ward from the open admission here, and the
 * tests that have a device in use on that ward or hospital-wide (a device not verified yet is never
 * listed, D-LAB2-11), each with its devices, their lots and the components to enter.
 */
export async function loadBedsideForm(hospitalId: string, patientUserId: string, userId: string) {
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
  // BQ-2 (Lab Phase 3 Step 8): a device a failed check has stopped is never offered; the form says why.
  const blocked = await tx
    .select({
      id: devices.id,
      model: devices.model,
      failedAt: sql<string | null>`(SELECT max(c.at)::text FROM lab_control_checks c
        WHERE c.device_id = ${devices.id} AND c.outcome = 'fail')`,
    })
    .from(devices)
    .where(
      and(
        eq(devices.hospitalId, hospitalId),
        eq(devices.state, "blocked"),
        isNotNull(devices.testCode),
        ward ? or(isNull(devices.wardId), eq(devices.wardId, ward.id)) : isNull(devices.wardId),
      ),
    );
  if (devs.length === 0) return { ward: ward ?? null, tests: [] as BedsideTest[], blocked };
  const quality = labPoctQualityLiveFor(hospitalId)
    ? await deviceStatus(
        tx,
        hospitalId,
        { userId, devices: devs.map((d) => ({ id: d.id, testCode: d.testCode })) },
        new Date(),
      )
    : null;

  const [lots, tests] = await Promise.all([
    tx
      .selectDistinct({
        id: labStockLots.id,
        deviceId: labLotsInUse.deviceId,
        lot: labStockLots.lot,
        state: labStockLots.state,
        useBy: labStockLots.useBy,
      })
      .from(labLotsInUse)
      .innerJoin(labStockLots, eq(labStockLots.id, labLotsInUse.lotId))
      .where(
        inArray(
          labLotsInUse.deviceId,
          devs.map((d) => d.id),
        ),
      )
      .then(usableLots),
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
        .map((d) => {
          const q = quality?.get(d.id);
          return {
            id: d.id,
            label: d.serial ? `${d.model} · ${d.serial}` : d.model,
            notice: q?.due.includes("each_day_of_use") ? LAB3.deviceCheckNotDone : null,
            lots: lots
              .filter((l) => l.deviceId === d.id)
              .map((l) => ({
                id: l.id,
                lot: l.lot,
                useBy: l.useBy,
                needsCheck:
                  !!q?.rule?.triggers.includes("new_strip_lot") && !q.checkedLots.has(l.id),
              })),
          };
        }),
    });
  }
  return { ward: ward ?? null, tests: out, blocked };
}
