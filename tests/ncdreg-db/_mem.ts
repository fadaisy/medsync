/**
 * A fast, in-memory mirror of the demo writer + loader for calibration tuning only: catalogue-shaped
 * patients → the engine's dataset, without a database. The calibration gate itself always loads
 * through the real command path (tests/ncdreg-db/calibration.test.ts).
 */
import type { ScenarioPatient } from "@/lib/ncdreg/demo/catalogue";
import { dayIso, medicines } from "@/lib/ncdreg/demo/writer";
import type { Dataset, DPerson } from "@/lib/ncdreg/indicators/dataset";
import { egfr, footRisk, kdigoA, kdigoG, visitBp } from "@/lib/ncdreg/standard/calculations";

export function toDataset(ps: readonly ScenarioPatient[], day0: string): Dataset {
  return {
    facilityId: "mem",
    timeZone: "Africa/Kampala",
    persons: ps.map((p, i): DPerson => {
      const birthYear = Number(day0.slice(0, 4)) - p.age_years_at_day_0;
      const regs = p.registrations.map((r) => ({ id: `${i}:${r.condition}`, condition: r.condition, date: dayIso(day0, r.registered_day) }));
      const deathDay = p.events.find((e) => e.type === "death")?.day;
      const visits = p.visits.map((v, j) => {
        const bp = v.bp ? visitBp(v.bp as [number, number][]) : null;
        return {
          id: `${i}:${j}`,
          date: dayIso(day0, v.day),
          type: v.type,
          closed: true,
          invalid: false,
          historical: false,
          enteredDate: dayIso(day0, v.day),
          bp,
          glucose: v.glucose ? { value: v.glucose.value, type: v.glucose.type } : null,
          hba1c: v.hba1c ? { percent: v.hba1c.value_percent, resultDate: dayIso(day0, v.hba1c.result_day) } : null,
          weightKg: v.weight_kg ?? null,
          medicines: medicines(v.medicines).codes,
          medicinesRecorded: true,
          missedDoses: v.missed_doses ?? null,
          medicinesObtained: v.medicines_obtained ?? null,
          notObtainedReason: v.medicines_not_obtained_reason ?? null,
          nextAppointment: v.next_appointment_day != null ? dayIso(day0, v.next_appointment_day) : null,
          disposition: null,
          recordedControl: Object.fromEntries(Object.entries(v.recorded_control ?? {}).map(([c, x]) => [`${i}:${c}`, x])),
        };
      });
      // Appointments: one per visit with a next date, created that day; a later one supersedes; death cancels.
      const appts = visits
        .filter((v) => v.nextAppointment)
        .map((v, j, all) => ({
          id: `${v.id}:a`,
          date: v.nextAppointment!,
          createdDate: v.date,
          status: j < all.length - 1 ? "superseded" : deathDay != null ? "cancelled" : "pending",
          updatedDate: j < all.length - 1 ? all[j + 1]!.date : deathDay != null ? dayIso(day0, deathDay) : v.date,
          reason: j < all.length - 1 ? "superseded" : deathDay != null ? "death" : null,
        }));
      const reviews = p.reviews.map((r) => {
        const date = dayIso(day0, r.day);
        const data = r as Record<string, unknown>;
        const derived: Record<string, unknown> = {};
        if (r.component === "kidney" && data.creatinine_umol_l != null) {
          const e = egfr(Number(data.creatinine_umol_l), Number(date.slice(0, 4)) - birthYear, p.sex);
          derived.egfr = e;
          derived.kdigoG = kdigoG(e);
          if (data.urine_test === "acr") derived.kdigoA = kdigoA(Number(data.acr_mg_mmol));
        }
        if (r.component === "feet")
          derived.footRisk = footRisk({
            loss_of_protective_sensation: !!data.loss_of_protective_sensation,
            absent_pulses: !!data.absent_pulses,
            deformity: !!data.deformity,
            previous_ulcer: !!data.previous_ulcer,
            amputation: (data.amputation as "none") ?? "none",
            end_stage_kidney_disease: false,
          });
        return {
          component: r.component,
          date,
          data: { ...data, creatinineUmol: data.creatinine_umol_l, urineTest: data.urine_test, examined: data.examined, retinopathyGrade: data.retinopathy_grade, macularOedema: data.macular_oedema },
          derived,
        };
      });
      return {
        id: `p${i}`,
        sex: p.sex,
        birthYear,
        isSynthetic: true,
        district: p.residence.district,
        knownCvd: p.baseline.known_cardiovascular_disease ?? [],
        hasValidPhone: !!p.phone_1 && !p.phone_1_flagged_invalid,
        recallRemovedAt: null,
        registrations: regs,
        visits,
        reviews,
        events: p.events.map((e) => ({ type: e.type, date: dayIso(day0, e.day), admissionReason: e.main_reason ?? null })),
        appointments: appts,
        calls: (p.recall?.calls ?? []).map((c) => ({ date: dayIso(day0, c.day), outcome: c.outcome })),
      };
    }),
  };
}
