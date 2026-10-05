/**
 * Writes golden patients into a PGlite test database through the engine's own commands (§6), each
 * record entered on its own day, so loader + engine see exactly what real capture would produce.
 * Test-only: entry times are supplied by the test (§10.3 allows tests to).
 */
import { createHash, randomUUID } from "node:crypto";
import type { GPatient, GVisit } from "./types";
import type { NcdContext } from "@/lib/ncdreg/context";

import { searchPersons } from "@/lib/ncdreg/search";
import { ok } from "../_engine";

const letters = (seed: string, n: number) =>
  [...createHash("sha256").update(seed).digest()]
    .slice(0, n)
    .map((b) => String.fromCharCode(97 + (b % 26)))
    .join("");

/** A context for a given day (09:00 Kampala), from one resolved for the right role. */
export const on = (ctx: NcdContext, iso: string): NcdContext => ({
  ...ctx,
  enteredAt: new Date(`${iso}T09:00:00+03:00`),
  today: iso,
});

type Op = { date: string; order: number; run: () => Promise<unknown> };

export async function writeGolden(
  patients: readonly GPatient[],
  roles: { clinician: NcdContext; officer: NcdContext },
): Promise<Map<string, string>> {
  const idOf = new Map<string, string>();
  const ops: Op[] = [];
  patients.forEach((g, index) => {
    const personId = randomUUID();
    idOf.set(g.id, personId);
    const regIds = new Map<string, string>();
    const regs = [...g.registrations].sort((a, b) => a.date.localeCompare(b.date));
    const first = regs[0]!;
    const regPayload = (r: (typeof regs)[number]) => {
      const registrationId = randomUUID();
      regIds.set(r.condition, registrationId);
      return {
        registrationId,
        condition: r.condition,
        subtype:
          r.subtype ??
          (r.condition === "hypertension"
            ? "primary"
            : r.condition === "diabetes"
              ? "type_2"
              : "unknown"),
        diagnosisYear: Number(r.date.slice(0, 4)),
        basisOfDiagnosis: "unknown",
      };
    };
    const firstRegs = regs.filter((r) => r.date === first.date);
    ops.push({
      date: first.date,
      order: 0,
      run: async () => {
        const c = on(roles.clinician, first.date);
        const identity = {
          givenName: `G${letters(`${g.id}g`, 7)}`,
          familyName: `F${letters(`${g.id}f`, 8)}`,
          sex: g.sex,
          dateOfBirth: g.dateOfBirth,
          phone1: g.phone
            ? `0700 1${String(index).padStart(2, "0")} ${String(100 + index).slice(-3)}`
            : null,
          district: g.district ? { code: g.district, name: g.district } : null,
        };
        const { token } = await searchPersons(c, {
          givenName: identity.givenName,
          familyName: identity.familyName,
          sex: g.sex,
          birthYear: Number(g.dateOfBirth.slice(0, 4)),
          phones: [identity.phone1],
          hospitalNumber: null,
          nationalId: null,
        });
        await ok(c, "person.enrol", {
          personId,
          searchToken: token,
          identity,
          registrations: firstRegs.map(regPayload),
          baseline: { heightCm: 165, knownCvd: g.knownCvd ?? [] },
          privacy: { version: "0.1-draft", acknowledged: true },
          smsAllowed: true,
          callsAllowed: true,
          isSynthetic: true,
          dismissedCandidates: [],
          confirmations: [],
        });
      },
    });
    for (const r of regs.filter((x) => x.date !== first.date))
      ops.push({
        date: r.date,
        order: 1,
        run: () =>
          ok(on(roles.clinician, r.date), "registration.add", { ...regPayload(r), personId }),
      });
    for (const v of g.visits ?? [])
      ops.push({
        date: v.enteredOn ?? v.date,
        order: 2,
        run: () =>
          ok(
            on(roles.clinician, v.enteredOn ?? v.date),
            "visit.record",
            visitPayload(personId, v, regIds),
          ),
      });
    for (const r of g.reviews ?? [])
      ops.push({
        date: r.date,
        order: 3,
        run: () =>
          ok(on(roles.clinician, r.date), "review.save", {
            reviewId: randomUUID(),
            personId,
            reviewDate: r.date,
            data: reviewData(r),
            confirmations: ["creatinine_umol", "acr_mg_mmol", "total_cholesterol", "ldl"],
          }),
      });
    for (const e of g.events ?? [])
      ops.push({
        date: e.date,
        order: 4,
        run: () =>
          ok(on(roles.clinician, e.date), "event.record", {
            eventId: randomUUID(),
            personId,
            type: e.type,
            eventDate: e.date,
            reportingUnit: "ncd_clinic",
            admissionReason: e.admissionReason ?? null,
            death: e.type === "death" ? { place: "this_facility", source: "ward" } : null,
          }),
      });
    for (const c of g.calls ?? [])
      ops.push({
        date: c.date,
        order: 5,
        run: () =>
          ok(on(roles.officer, c.date), "call.log", {
            callId: randomUUID(),
            personId,
            outcome: c.outcome,
            newAppointmentDate: c.newDate ?? null,
            phoneSlot: 1,
          }),
      });
  });
  // One person's records in order; persons are independent of each other.
  ops.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  for (const op of ops) await op.run();
  return idOf;
}

function visitPayload(personId: string, v: GVisit, regIds: Map<string, string>) {
  return {
    visitId: randomUUID(),
    personId,
    visitDate: v.date,
    visitType: v.type ?? "scheduled",
    isHistorical: !!v.historical,
    weightKg: v.weightKg ?? null,
    bp: v.bp ?? [],
    glucose: v.glucose
      ? { value: v.glucose.value, unit: "mmol", type: v.glucose.type, method: "capillary" }
      : null,
    hba1c: v.hba1c ?? null,
    medicines: { codes: v.medicines ?? [], confirmedUnchanged: false },
    missedDoses: v.missedDoses ?? "none",
    medicinesObtained: v.obtained ?? "full",
    notObtainedReason: v.notObtainedReason ?? null,
    nextAppointmentDate: v.next ?? null,
    disposition: v.disposition ?? null,
    conditionFields: Object.entries(v.control ?? {}).map(([condition, recordedControl]) => ({
      registrationId: regIds.get(condition)!,
      recordedControl,
      observations: {},
    })),
    confirmations: [
      "systolic",
      "diastolic",
      "systolic_not_above_diastolic",
      "weight_kg",
      "glucose_mmol",
      "hba1c_percent",
    ],
  };
}

function reviewData(r: NonNullable<GPatient["reviews"]>[number]) {
  switch (r.component) {
    case "kidney":
      return {
        component: "kidney" as const,
        creatinine: r.creatinineUmol ?? null,
        creatinineUnit: "umol" as const,
        urineTest: r.acr != null ? ("acr" as const) : r.dipstick ? ("dipstick" as const) : null,
        acrMgMmol: r.acr ?? null,
        dipstick: r.dipstick ?? null,
      };
    case "eyes":
      return {
        component: "eyes" as const,
        examined: r.examined,
        method: r.examined ? ("dilated_fundoscopy" as const) : null,
        retinopathyGrade: (r.grade ?? null) as never,
        macularOedema: r.macularOedema ?? null,
      };
    case "feet":
      return {
        component: "feet" as const,
        lossOfProtectiveSensation: !!r.lops,
        absentPulses: !!r.absentPulses,
        deformity: !!r.deformity,
        currentUlcer: !!r.currentUlcer,
        previousUlcer: !!r.previousUlcer,
        amputation: r.amputation ?? "none",
      };
    case "lipids":
      return {
        component: "lipids" as const,
        totalCholesterol: r.total ?? null,
        ldl: r.ldl ?? null,
      };
  }
}
