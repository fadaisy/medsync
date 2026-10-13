import "server-only";

import type { Payload } from "./signed-config";
import type { EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  cadres,
  devices,
  hospitalWards,
  labLotsInUse,
  labSettings,
  labSignedConfigs,
  labStockLots,
  poctOperators,
  staffAffiliations,
  testCatalogue,
  users,
} from "@/db/schema";
import { NURSE_CADRES, ORDERING_CADRES } from "@/lib/emr/write/orders";
import { PAYLOADS } from "./signed-config";

/**
 * Lab settings (Lab Phase 2 §5.14, artboard 14): the hospital's lab_settings row, and for elevation and the
 * HIV algorithm the signed version in force, the lead-signed draft waiting for the CSO, and the open draft.
 * Nothing is defaulted: a missing row or version reads as null (Law 5).
 */

type Kind = "elevation" | "hiv_algorithm";
/** The bedside device kinds (0110); the rest of `devices` is lab equipment (0113). */
export const BEDSIDE_KINDS = [
  "glucometer",
  "ketone_meter",
  "hba1c_analyser",
  "bp_monitor",
  "rdt_kit",
  "dipstick",
] as const;
export interface ConfigSlot<K extends Kind> {
  signed: { payload: Payload<K>; inForceFrom: Date | null } | null;
  awaitingCso: { id: string; payload: Payload<K> } | null;
  draft: { id: string; payload: Payload<K> | null; authoredBy: string } | null;
}

const KEYS = { elevation: "hospital", hiv_algorithm: "serial" } as const;

export async function loadLabSettingsPage(tx: EmrTx, hospitalId: string) {
  const [settings] = await tx
    .select({
      reportEgfr: labSettings.reportEgfr,
      paymentMode: labSettings.paymentMode,
      highRiskProcedure: labSettings.highRiskProcedure,
    })
    .from(labSettings)
    .where(eq(labSettings.hospitalId, hospitalId));
  const rows = await tx
    .select()
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.hospitalId, hospitalId),
        inArray(labSignedConfigs.kind, ["elevation", "hiv_algorithm"]),
        inArray(labSignedConfigs.status, ["signed", "draft"]),
      ),
    )
    .orderBy(desc(labSignedConfigs.version));

  function slot<K extends Kind>(kind: K): ConfigSlot<K> {
    const mine = rows.filter((r) => r.kind === kind && r.key === KEYS[kind]);
    const parse = (p: unknown) => {
      const r = PAYLOADS[kind].safeParse(p);
      return r.success ? (r.data as Payload<K>) : null;
    };
    const signed = mine.find((r) => r.status === "signed");
    const waiting = mine.find((r) => r.status === "draft" && r.leadSignedBy);
    const open = mine.find((r) => r.status === "draft" && !r.leadSignedBy);
    const signedPayload = signed ? parse(signed.payload) : null;
    const waitingPayload = waiting ? parse(waiting.payload) : null;
    return {
      signed: signedPayload ? { payload: signedPayload, inForceFrom: signed!.inForceFrom } : null,
      awaitingCso: waitingPayload ? { id: waiting!.id, payload: waitingPayload } : null,
      draft: open
        ? { id: open.id, payload: parse(open.payload), authoredBy: open.authoredBy }
        : null,
    };
  }

  return {
    reportEgfr: settings?.reportEgfr ?? false,
    paymentMode: settings?.paymentMode ?? "off",
    highRiskProcedure: settings?.highRiskProcedure ?? null,
    elevation: slot("elevation"),
    hiv: slot("hiv_algorithm"),
  };
}

/**
 * Bedside devices and kits (§5.14; PC-2, PC-10, D-LAB2-09..-12): every device registered here with its test,
 * where it is used and its newest lot; the wards and tests to register against; and the nurses, midwives
 * and clinicians who may be granted bedside testing, with whether they hold it now.
 */
export async function loadBedsideRegister(tx: EmrTx, hospitalId: string) {
  const [devs, lots, wards, tests, staff, granted] = await Promise.all([
    tx
      .select({
        id: devices.id,
        kind: devices.kind,
        model: devices.model,
        serial: devices.serial,
        testCode: devices.testCode,
        wardId: devices.wardId,
        state: devices.state,
      })
      .from(devices)
      // Bedside kinds only: lab equipment shares the table since Lab Phase 3 (0113).
      .where(and(eq(devices.hospitalId, hospitalId), inArray(devices.kind, [...BEDSIDE_KINDS])))
      .orderBy(asc(devices.model)),
    tx
      .select({ deviceId: labLotsInUse.deviceId, lot: labStockLots.lot, useBy: labStockLots.useBy })
      .from(labLotsInUse)
      .innerJoin(labStockLots, eq(labStockLots.id, labLotsInUse.lotId))
      .where(eq(labLotsInUse.hospitalId, hospitalId))
      .orderBy(desc(labStockLots.useBy)),
    tx
      .select({ id: hospitalWards.id, name: hospitalWards.name })
      .from(hospitalWards)
      .where(and(eq(hospitalWards.hospitalId, hospitalId), isNull(hospitalWards.archivedAt)))
      .orderBy(asc(hospitalWards.name)),
    tx
      .select({ code: testCatalogue.code, display: testCatalogue.display })
      .from(testCatalogue)
      .where(
        and(
          isNull(testCatalogue.hospitalId),
          eq(testCatalogue.kind, "lab"),
          eq(testCatalogue.active, true),
        ),
      )
      .orderBy(asc(testCatalogue.display)),
    tx
      .selectDistinct({ userId: users.id, name: users.fullName, cadre: cadres.name })
      .from(staffAffiliations)
      .innerJoin(users, eq(users.id, staffAffiliations.userId))
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
          inArray(cadres.code, [...NURSE_CADRES, ...ORDERING_CADRES]),
        ),
      )
      .limit(500),
    tx
      .select({ userId: poctOperators.userId })
      .from(poctOperators)
      .where(and(eq(poctOperators.hospitalId, hospitalId), isNull(poctOperators.revokedAt))),
  ]);
  const wardName = new Map(wards.map((w) => [w.id, w.name]));
  const testName = new Map(tests.map((t) => [t.code, t.display]));
  const on = new Set(granted.map((g) => g.userId));
  return {
    devices: devs.map((d) => ({
      ...d,
      test: d.testCode ? (testName.get(d.testCode) ?? d.testCode) : null,
      ward: d.wardId ? (wardName.get(d.wardId) ?? null) : null,
      lot: lots.find((l) => l.deviceId === d.id) ?? null,
    })),
    wards,
    tests,
    operators: staff
      .map((s) => ({ ...s, granted: on.has(s.userId) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
