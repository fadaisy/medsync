/**
 * §10.3: writes one scenario-shaped patient through the normal command path, as the demo_loader
 * principal, each record on its own day (the loader supplies the entry time). Command ids are UUID
 * v5 of (demo load id, catalogue key, position), so replaying a load is a no-op.
 */
import "server-only";

import { createHash } from "node:crypto";
import type { CommandType } from "../commands/schema";
import type { NcdContext } from "../context";
import type { ScenarioPatient, ScenarioVisit } from "./catalogue";

import { applyCommand } from "../commands/apply";
import { NcdError } from "../context";
import { searchPersons } from "../search";
import { medicineByCode } from "../standard/code-lists";

/** RFC 4122 version 5 (SHA-1, name-based) in the URL namespace. */
const NS = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
export function uuidv5(name: string): string {
  const h = createHash("sha1")
    .update(Buffer.concat([NS, Buffer.from(name, "utf8")]))
    .digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export const dayIso = (day0: string, d: number) => {
  const t = new Date(`${day0}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
// ponytail: Africa/Kampala is UTC+3 all year (no DST); a facility in another zone needs its offset here.
const at = (iso: string, hhmm = "09:00") => new Date(`${iso}T${hhmm}:00+03:00`);

/** "isophane insulin" → isophane_insulin; "other: …" → other with free text. */
export function medicines(names: readonly string[]) {
  const codes: string[] = [];
  const other: string[] = [];
  for (const n of names) {
    if (n.startsWith("other:")) {
      codes.push("other");
      other.push(n.slice(6).trim());
      continue;
    }
    const code = n.trim().toLowerCase().replace(/\s+/g, "_");
    if (!medicineByCode.has(code))
      throw new NcdError("invalid", `Unknown medicine in the catalogue: ${n}`);
    codes.push(code);
  }
  return { codes, otherText: other.length ? other.join("; ") : null };
}

type Op = {
  day: number;
  time: string;
  order: number;
  type: CommandType;
  payload: () => Record<string, unknown> | Promise<Record<string, unknown>>;
};

export type WriteOptions = { day0: string; demoLoadId: string };

export async function writeScenarioPatient(
  base: NcdContext,
  p: ScenarioPatient,
  o: WriteOptions,
): Promise<{ personId: string; commands: number }> {
  const personId = uuidv5(`${o.demoLoadId}:${p.key}:person`);
  const birthYear = Number(o.day0.slice(0, 4)) - p.age_years_at_day_0;
  const regId = (condition: string) => uuidv5(`${o.demoLoadId}:${p.key}:reg:${condition}`);
  const ctxAt = (day: number, time?: string): NcdContext => {
    const iso = dayIso(o.day0, day);
    return { ...base, enteredAt: at(iso, time), today: iso };
  };
  const regs = [...p.registrations].sort((a, b) => a.registered_day - b.registered_day);
  const firstDay = regs[0]!.registered_day;
  const regPayload = (r: ScenarioPatient["registrations"][number]) => ({
    registrationId: regId(r.condition),
    condition: r.condition,
    subtype: r.subtype,
    diagnosisYear: Number(o.day0.slice(0, 4)) - r.diagnosed_years_before_day_0,
    basisOfDiagnosis: r.basis_of_diagnosis,
    whereFirstDiagnosed: r.where_first_diagnosed,
    referralSource: r.referral_source,
    registrationDate: dayIso(o.day0, r.registered_day),
  });
  const conditionFields = (v: {
    recorded_control?: Record<string, string>;
    observations?: Record<string, unknown>;
  }) => {
    const out = new Map<
      string,
      {
        registrationId: string;
        recordedControl: string | null;
        observations: Record<string, unknown>;
      }
    >();
    for (const [c, rc] of Object.entries(v.recorded_control ?? {}))
      out.set(c, { registrationId: regId(c), recordedControl: rc, observations: {} });
    for (const [code, value] of Object.entries(v.observations ?? {})) {
      // An observation belongs to the core registration whose module defines it.
      const owner = regs.find((r) =>
        base.catalogue
          .find((m) => m.code === r.condition)
          ?.visit_fields.some((f) => f.code === code),
      );
      if (!owner) continue;
      const cf = out.get(owner.condition) ?? {
        registrationId: regId(owner.condition),
        recordedControl: null,
        observations: {},
      };
      cf.observations[code] = value;
      out.set(owner.condition, cf);
    }
    return [...out.values()];
  };
  const CONFIRM = [
    "systolic",
    "diastolic",
    "systolic_not_above_diastolic",
    "weight_kg",
    "glucose_mmol",
    "hba1c_percent",
    "height_cm",
    "creatinine_umol",
    "acr_mg_mmol",
    "total_cholesterol",
    "ldl",
  ];

  const ops: Op[] = [];
  ops.push({
    day: firstDay,
    time: "08:00",
    order: 0,
    type: "person.enrol",
    payload: async () => {
      const c = ctxAt(firstDay, "08:00");
      const identity = {
        givenName: p.given_name,
        familyName: p.family_name,
        sex: p.sex,
        ageYears: Number(dayIso(o.day0, firstDay).slice(0, 4)) - birthYear,
        phone1: p.phone_1,
        hospitalNumber: p.hospital_number ?? null,
        district: { code: p.residence.district, name: p.residence.district },
        subcounty: p.residence.sub_county
          ? { code: p.residence.sub_county, name: p.residence.sub_county }
          : null,
        parish: p.residence.parish ?? null,
      };
      // A1: the loader searches too, and confirms a new person where candidates appear.
      const { token, candidates } = await searchPersons(c, {
        givenName: p.given_name,
        familyName: p.family_name,
        sex: p.sex,
        birthYear,
        phones: [p.phone_1],
        hospitalNumber: p.hospital_number ?? null,
        nationalId: null,
      });
      return {
        personId,
        searchToken: token,
        identity,
        registrations: regs.filter((r) => r.registered_day === firstDay).map(regPayload),
        baseline: {
          heightCm: p.baseline.height_cm ?? null,
          tobacco: p.baseline.tobacco ?? null,
          alcohol: p.baseline.alcohol ?? null,
          knownCvd: p.baseline.known_cardiovascular_disease ?? [],
          knownKidneyDisease: p.baseline.known_kidney_disease ?? null,
          familyHistoryDiabetes: p.baseline.family_history_diabetes ?? null,
          familyHistoryHypertension: p.baseline.family_history_hypertension ?? null,
        },
        privacy: { version: p.privacy_notice.version, acknowledged: true },
        smsAllowed: p.sms_allowed,
        callsAllowed: p.calls_allowed,
        isSynthetic: true,
        registryNumber: p.registry_number,
        dismissedCandidates: candidates.map((x) => x.personId),
        confirmations: CONFIRM,
      };
    },
  });
  for (const r of regs.filter((x) => x.registered_day !== firstDay))
    ops.push({
      day: r.registered_day,
      time: "08:00",
      order: 1,
      type: "registration.add",
      payload: () => ({ ...regPayload(r), personId }),
    });
  const visitBody = (v: ScenarioVisit) => ({
    weightKg: v.weight_kg ?? null,
    bp: v.bp ?? [],
    glucose: v.glucose
      ? { value: v.glucose.value, unit: "mmol", type: v.glucose.type, method: v.glucose.method }
      : null,
    hba1c: v.hba1c
      ? { percent: v.hba1c.value_percent, resultDate: dayIso(o.day0, v.hba1c.result_day) }
      : null,
    medicines: { ...medicines(v.medicines), confirmedUnchanged: false },
    missedDoses: v.missed_doses ?? null,
    hypoglycaemia: v.hypoglycaemia ?? null,
    medicinesObtained: v.medicines_obtained ?? null,
    notObtainedReason: v.medicines_not_obtained_reason ?? null,
    nextAppointmentDate:
      v.next_appointment_day != null ? dayIso(o.day0, v.next_appointment_day) : null,
    conditionFields: conditionFields(v),
    confirmations: CONFIRM,
  });
  p.visits.forEach((v, i) =>
    ops.push({
      day: v.day,
      time: "10:00",
      order: 2,
      type: "visit.record",
      payload: () => ({
        visitId: uuidv5(`${o.demoLoadId}:${p.key}:visit:${i}`),
        personId,
        visitDate: dayIso(o.day0, v.day),
        visitType: v.type,
        isHistorical: false,
        ...visitBody(v),
      }),
    }),
  );
  p.reviews.forEach((r, i) =>
    ops.push({
      day: r.day,
      time: "11:00",
      order: 3,
      type: "review.save",
      payload: () => ({
        reviewId: uuidv5(`${o.demoLoadId}:${p.key}:review:${i}`),
        personId,
        reviewDate: dayIso(o.day0, r.day),
        data: reviewData(r),
        confirmations: CONFIRM,
      }),
    }),
  );
  p.events.forEach((e, i) =>
    ops.push({
      day: e.day,
      time: "12:00",
      order: 4,
      type: "event.record",
      payload: () => ({
        eventId: uuidv5(`${o.demoLoadId}:${p.key}:event:${i}`),
        personId,
        type: e.type,
        eventDate: dayIso(o.day0, e.day),
        reportingUnit: e.reporting_unit,
        admissionReason: e.main_reason ?? null,
        death:
          e.type === "death"
            ? { place: e.place ?? "unknown", source: e.information_source ?? "other" }
            : null,
        transferDestination: e.destination ?? null,
      }),
    }),
  );
  if (p.today && p.today.stage !== "not_arrived" && p.today.arrived_at) {
    const t = p.today;
    const visitId = uuidv5(`${o.demoLoadId}:${p.key}:today`);
    ops.push({
      day: 0,
      time: t.arrived_at!,
      order: 6,
      type: "visit.arrive",
      payload: () => ({ visitId, personId, visitType: "scheduled", appointmentId: null }),
    });
    if (t.nurse_part) {
      const n = t.nurse_part;
      ops.push({
        day: 0,
        time: n.saved_at,
        order: 7,
        type: "visit.save_nurse",
        payload: () => ({
          visitId,
          personId,
          weightKg: n.weight_kg ?? null,
          bp: n.bp ?? [],
          glucose: n.glucose
            ? {
                value: n.glucose.value,
                unit: "mmol",
                type: n.glucose.type,
                method: n.glucose.method,
              }
            : null,
          confirmations: CONFIRM,
        }),
      });
    }
    if (t.stage === "with_clinician")
      ops.push({
        day: 0,
        time: t.nurse_part?.saved_at ?? t.arrived_at!,
        order: 8,
        type: "visit.start_clinician",
        payload: () => ({ visitId, personId }),
      });
    if (t.clinician_part) {
      const c = t.clinician_part;
      ops.push({
        day: 0,
        time: c.saved_at,
        order: 9,
        type: "visit.close",
        payload: () => ({
          visitId,
          personId,
          medicines: {
            ...medicines(c.medicines),
            confirmedUnchanged: !!c.medicines_confirmed_unchanged,
          },
          missedDoses: c.missed_doses ?? null,
          hypoglycaemia: c.hypoglycaemia ?? null,
          medicinesObtained: c.medicines_obtained ?? null,
          nextAppointmentDate:
            c.next_appointment_day != null ? dayIso(o.day0, c.next_appointment_day) : null,
          conditionFields: [],
          confirmations: CONFIRM,
        }),
      });
    }
  }
  (p.recall?.calls ?? []).forEach((c, i) =>
    ops.push({
      day: c.day,
      time: "14:00",
      order: 5,
      type: "call.log",
      payload: () => ({
        callId: uuidv5(`${o.demoLoadId}:${p.key}:call:${i}`),
        personId,
        outcome: c.outcome,
        newAppointmentDate:
          c.new_appointment_day != null ? dayIso(o.day0, c.new_appointment_day) : null,
        phoneSlot: 1,
        callDate: dayIso(o.day0, c.day),
      }),
    }),
  );
  if (p.phone_1_flagged_invalid)
    ops.push({
      day: 0,
      time: "07:00",
      order: 10,
      type: "person.flag_phone",
      payload: () => ({ personId, slot: 1, invalid: true }),
    });

  ops.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time) || a.order - b.order);
  let n = 0;
  for (const op of ops) {
    const ctx = ctxAt(op.day, op.time);
    const r = await applyCommand(ctx, {
      id: uuidv5(`${o.demoLoadId}:${p.key}:cmd:${n}`),
      type: op.type,
      payload: await op.payload(),
      clientTs: null,
    });
    if (!r.ok)
      throw new NcdError(
        r.code === "error" ? "invalid" : r.code,
        `${p.key} ${op.type}: ${r.message}`,
        r.detail,
      );
    n++;
  }
  return { personId, commands: n };
}

function reviewData(r: { component: string } & Record<string, unknown>) {
  const b = (k: string) => (r[k] == null ? null : Boolean(r[k]));
  switch (r.component) {
    case "kidney":
      return {
        component: "kidney",
        creatinine: (r.creatinine_umol_l as number | undefined) ?? null,
        creatinineUnit: "umol",
        urineTest: (r.urine_test as string | undefined) ?? null,
        acrMgMmol: (r.acr_mg_mmol as number | undefined) ?? null,
        dipstick: (r.dipstick as string | undefined) ?? null,
      };
    case "eyes":
      return {
        component: "eyes",
        examined: !!r.examined,
        method: (r.method as string | undefined) ?? null,
        retinopathyGrade: (r.retinopathy_grade as string | undefined) ?? null,
        macularOedema: (r.macular_oedema as string | undefined) ?? null,
        referred: b("referred"),
      };
    case "feet":
      return {
        component: "feet",
        lossOfProtectiveSensation: !!r.loss_of_protective_sensation,
        absentPulses: !!r.absent_pulses,
        deformity: !!r.deformity,
        currentUlcer: !!r.current_ulcer,
        previousUlcer: !!r.previous_ulcer,
        amputation: (r.amputation as string | undefined) ?? "none",
      };
    default:
      return {
        component: "lipids",
        totalCholesterol: (r.total_cholesterol_mmol_l as number | undefined) ?? null,
        ldl: (r.ldl_mmol_l as number | undefined) ?? null,
      };
  }
}
