/**
 * What the screens read (B2, B8, E1, C3, F4). Identifiers are decrypted only here, under
 * medsync_ncd_app and the caller's capabilities; numbers are masked unless a "Show number" action is
 * taken, which is audited (§8.2). Every record view and list view writes an access event (D-12).
 */
import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { ncdAccessEvent, ncdAppointment, ncdCall, ncdObservation, ncdPerson, ncdVisit } from "@/db/schema";
import { formatUgPhone } from "@/lib/onboarding/fields";

import { authorize, can, type NcdContext } from "../context";
import { dec } from "../crypto";
import { facilitySettings } from "../commands/shared";
import { withNcd, type NcdTx } from "../db";
import { normalisePhone } from "../identity";
import type { DPerson } from "../indicators/dataset";
import { loadDataset } from "../indicators/load";
import { CLASS_LABELS } from "../standard/classifications";
import {
  careBandOf,
  classesAtVisit,
  closedVisits,
  currentAppointment,
  gradeFromLatest,
  lastClasses,
  latestKidney,
  modulesOf,
  overdueDays,
  reviewsDue,
  statusOf,
  trajectory,
} from "./derive";

export async function logAccess(
  ctx: NcdContext,
  action: string,
  personId: string | null,
  detail: Record<string, unknown> = {},
  tx?: NcdTx,
) {
  const write = (t: NcdTx) =>
    t.insert(ncdAccessEvent).values({
      facilityId: ctx.facilityId,
      userId: ctx.userId,
      principal: ctx.principal,
      action,
      personId,
      demoLoadId: ctx.demoLoadId,
      detail,
      at: ctx.enteredAt,
    });
  return tx ? write(tx) : withNcd(ctx, "app", write, ctx.db);
}

export type Identity = {
  id: string;
  name: string;
  initials: string;
  registryNumber: string;
  isSynthetic: boolean;
  sex: "female" | "male";
  age: number;
  phones: { slot: 1 | 2; masked: string; invalid: boolean }[];
  smsAllowed: boolean;
  callsAllowed: boolean;
  district: string | null;
};

const mask = (p: string) => {
  const e = normalisePhone(p);
  const f = e ? formatUgPhone(e) : p;
  return `${f.slice(0, 4)} ••• ${f.slice(-3)}`;
};

export async function identities(ctx: NcdContext, ids: readonly string[], tx?: NcdTx): Promise<Map<string, Identity>> {
  if (!ids.length) return new Map();
  const read = async (t: NcdTx) =>
    t
      .select({
        id: ncdPerson.id,
        given: ncdPerson.givenNameCiphertext,
        family: ncdPerson.familyNameCiphertext,
        reg: ncdPerson.registryNumber,
        syn: ncdPerson.isSynthetic,
        sex: ncdPerson.sex,
        birthYear: ncdPerson.birthYear,
        p1: ncdPerson.phone1Ciphertext,
        p1i: ncdPerson.phone1Invalid,
        p2: ncdPerson.phone2Ciphertext,
        p2i: ncdPerson.phone2Invalid,
        sms: ncdPerson.smsAllowed,
        calls: ncdPerson.callsAllowed,
        district: ncdPerson.districtName,
      })
      .from(ncdPerson)
      .where(inArray(ncdPerson.id, [...ids]));
  const rows = tx ? await read(tx) : await withNcd(ctx, "app", read, ctx.db);
  const year = Number(ctx.today.slice(0, 4));
  return new Map(
    rows.map((r) => {
      const given = dec(r.given) ?? "";
      const family = dec(r.family) ?? "";
      const phones: Identity["phones"] = [];
      const p1 = dec(r.p1);
      const p2 = dec(r.p2);
      if (p1) phones.push({ slot: 1, masked: mask(p1), invalid: r.p1i });
      if (p2) phones.push({ slot: 2, masked: mask(p2), invalid: r.p2i });
      return [
        r.id,
        {
          id: r.id,
          name: `${given} ${family}`.trim(),
          initials: `${given[0] ?? ""}${family[0] ?? ""}`.toUpperCase(),
          registryNumber: r.reg,
          isSynthetic: r.syn,
          sex: r.sex as "female" | "male",
          age: year - r.birthYear,
          phones,
          smsAllowed: r.sms,
          callsAllowed: r.calls,
          district: r.district,
        },
      ];
    }),
  );
}

/** "Show number": the full number, audited. Demo numbers come back labelled, never dialable. */
export async function revealPhone(ctx: NcdContext, personId: string, slot: 1 | 2) {
  authorize(ctx, "identifier_reveal");
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const [p] = await tx
        .select({ p1: ncdPerson.phone1Ciphertext, p2: ncdPerson.phone2Ciphertext, syn: ncdPerson.isSynthetic })
        .from(ncdPerson)
        .where(eq(ncdPerson.id, personId));
      if (!p) return null;
      await logAccess(ctx, "reveal_phone", personId, { slot }, tx);
      const raw = dec(slot === 1 ? p.p1 : p.p2);
      return raw ? { number: formatUgPhone(normalisePhone(raw) ?? raw), demo: p.syn } : null;
    },
    ctx.db,
  );
}

/* ─── B8 Today's clinic ────────────────────────────────────────────────── */

export type ClinicRow = {
  personId: string;
  identity: Identity;
  conditions: { code: string; label: string }[];
  stage: "not_arrived" | "waiting" | "measurements_taken" | "with_clinician" | "closed";
  visitId: string | null;
  appointmentId: string | null;
  arrivedAt: string | null;
  walkIn: boolean;
  lastBp: string | null;
  lastBpTone: "in" | "out" | null;
  lastGlucose: string | null;
  glucoseApplies: boolean;
  reviewDue: string[];
};

export async function todayClinic(ctx: NcdContext, date = ctx.today): Promise<{ rows: ClinicRow[]; expected: number; closed: number }> {
  authorize(ctx, "person_search", "demo_write");
  const { appts, visits } = await withNcd(
    ctx,
    "app",
    async (tx) => {
      const appts = await tx
        .select({ id: ncdAppointment.id, personId: ncdAppointment.personId })
        .from(ncdAppointment)
        .where(and(eq(ncdAppointment.appointmentDate, date), inArray(ncdAppointment.status, ["pending", "attended"])));
      const visits = await tx
        .select({ id: ncdVisit.id, personId: ncdVisit.personId, stage: ncdVisit.stage, arrivedAt: ncdVisit.arrivedAt, appointmentId: ncdVisit.appointmentId, status: ncdVisit.status })
        .from(ncdVisit)
        .where(and(eq(ncdVisit.visitDate, date), eq(ncdVisit.isInvalid, false), eq(ncdVisit.isHistorical, false)))
        .orderBy(asc(ncdVisit.arrivedAt));
      await logAccess(ctx, "list_view", null, { list: "today", date }, tx);
      return { appts, visits };
    },
    ctx.db,
  );
  const personIds = [...new Set([...appts.map((a) => a.personId), ...visits.map((v) => v.personId)])];
  const [ids, ds] = await Promise.all([identities(ctx, personIds), loadDataset(ctx, personIds)]);
  const byId = new Map(ds.persons.map((p) => [p.id, p]));
  const rows: ClinicRow[] = [];
  for (const personId of personIds) {
    const p = byId.get(personId);
    const idn = ids.get(personId);
    if (!p || !idn) continue;
    // A same-day duplicate (a data-quality query) never hides the first visit of the day.
    const visit = visits.find((v) => v.personId === personId);
    const appt = appts.find((a) => a.personId === personId);
    const prior = closedVisits(p).filter((v) => v.id !== visit?.id);
    const lastBp = [...prior].reverse().find((v) => v.bp);
    const lastGlu = [...prior].reverse().find((v) => v.glucose);
    const mods = modulesOf(p, ctx.catalogue);
    const glucoseApplies = mods.some(({ module: m }) => m.visit_fields.some((f) => f.code === "glucose"));
    rows.push({
      personId,
      identity: idn,
      conditions: mods.map(({ module: m }) => ({ code: m.code, label: m.label })),
      stage: visit ? (visit.stage as ClinicRow["stage"]) : "not_arrived",
      visitId: visit?.id ?? null,
      appointmentId: appt?.id ?? null,
      arrivedAt: visit?.arrivedAt ? visit.arrivedAt.toISOString() : null,
      walkIn: !appt,
      lastBp: lastBp?.bp ? `${lastBp.bp[0]}/${lastBp.bp[1]}` : null,
      lastBpTone: lastBp?.bp ? (lastBp.bp[0] < 140 && lastBp.bp[1] < 90 ? "in" : "out") : null,
      lastGlucose: glucoseApplies && lastGlu?.glucose ? `${lastGlu.glucose.value.toFixed(1)} ${lastGlu.glucose.type === "fasting" ? "fasting" : lastGlu.glucose.type === "random" ? "random" : "after meal"}` : null,
      glucoseApplies,
      reviewDue: reviewsDue(p, ctx.catalogue, date).filter((r) => r.due).map((r) => r.component),
    });
  }
  const order = { with_clinician: 0, measurements_taken: 1, waiting: 2, not_arrived: 3, closed: 4 } as const;
  rows.sort((a, b) => order[a.stage] - order[b.stage] || (a.arrivedAt ?? "z").localeCompare(b.arrivedAt ?? "z"));
  return { rows, expected: rows.length, closed: rows.filter((r) => r.stage === "closed").length };
}

/* ─── Patients ─────────────────────────────────────────────────────────── */

export async function patientsList(ctx: NcdContext, o: { q?: string; limit?: number; offset?: number } = {}) {
  authorize(ctx, "person_search", "drill_down", "recall_work", "demo_write");
  const { idsPage, total } = await withNcd(
    ctx,
    "app",
    async (tx) => {
      const all = await tx
        .select({ id: ncdPerson.id, reg: ncdPerson.registryNumber })
        .from(ncdPerson)
        .where(and(eq(ncdPerson.facilityId, ctx.facilityId), isNull(ncdPerson.mergedIntoId)))
        .orderBy(desc(ncdPerson.enteredAt));
      await logAccess(ctx, "list_view", null, { list: "patients" }, tx);
      return { idsPage: all, total: all.length };
    },
    ctx.db,
  );
  const ids = await identities(ctx, idsPage.map((r) => r.id));
  const q = o.q?.trim().toLowerCase();
  const matched = [...ids.values()].filter((i) => !q || i.name.toLowerCase().includes(q) || i.registryNumber.toLowerCase().includes(q));
  const page = matched.slice(o.offset ?? 0, (o.offset ?? 0) + (o.limit ?? 50));
  const ds = await loadDataset(ctx, page.map((p) => p.id));
  const byId = new Map(ds.persons.map((p) => [p.id, p]));
  return {
    total,
    matched: matched.length,
    rows: page.map((idn) => {
      const p = byId.get(idn.id)!;
      return {
        identity: idn,
        conditions: modulesOf(p, ctx.catalogue).map(({ module: m }) => ({ code: m.code, label: m.label })),
        status: statusOf(p, ctx.today),
        lastVisit: closedVisits(p).at(-1)?.date ?? null,
        careBand: careBandOf(p, ctx.today),
      };
    }),
  };
}

/* ─── Patient record (and the visit screen's header + trajectory) ──────── */

export async function personView(ctx: NcdContext, personId: string, o: { audit?: boolean } = { audit: true }) {
  authorize(ctx, "person_search", "drill_down", "recall_work", "data_quality", "demo_write");
  const [ids, ds] = await Promise.all([identities(ctx, [personId]), loadDataset(ctx, [personId])]);
  const identity = ids.get(personId);
  const p = ds.persons[0];
  if (!identity || !p) return null;
  if (o.audit) await logAccess(ctx, "view", personId);
  const mods = modulesOf(p, ctx.catalogue);
  return {
    identity,
    person: p,
    modules: mods,
    status: statusOf(p, ctx.today),
    careBand: careBandOf(p, ctx.today),
    reviews: reviewsDue(p, ctx.catalogue, ctx.today),
    trajectory: trajectory(p),
    kidney: latestKidney(p),
    grade: gradeFromLatest(p),
    lastClasses: lastClasses(p, ctx.catalogue),
    appointment: currentAppointment(p),
    overdueDays: overdueDays(p, ctx.today),
  };
}
export type PersonView = NonNullable<Awaited<ReturnType<typeof personView>>>;

/* ─── E1 Recall ────────────────────────────────────────────────────────── */

export type RecallRow = {
  identity: Identity;
  daysOverdue: number;
  missed: string;
  appointmentId: string;
  classes: { label: string; leading: boolean }[];
  conditions: string[];
  lastCall: { date: string; outcome: string } | null;
  calledThisMonth: boolean;
  noPhone: boolean;
};

export async function recallList(ctx: NcdContext) {
  authorize(ctx, "recall_work", "demo_write");
  const ds = await loadDataset(ctx);
  const monthStart = `${ctx.today.slice(0, 7)}-01`;
  const overdue: { p: DPerson; days: number }[] = [];
  for (const p of ds.persons) {
    if (statusOf(p, ctx.today) !== "overdue" || p.recallRemovedAt) continue;
    const d = overdueDays(p, ctx.today);
    if (d != null) overdue.push({ p, days: d });
  }
  // E1: days overdue, then the outcome class at the last visit (rule modules only: not in range first).
  const ids = await identities(ctx, overdue.map((o) => o.p.id));
  const rows: RecallRow[] = overdue.map(({ p, days }) => {
    const cls = lastClasses(p, ctx.catalogue).filter((c) => !c.clinicianRecorded);
    const lastCall = [...p.calls].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
    const idn = ids.get(p.id)!;
    return {
      identity: idn,
      daysOverdue: days,
      missed: currentAppointment(p)!.date,
      appointmentId: currentAppointment(p)!.id,
      classes: cls.map((c) => ({ label: c.label, leading: c.leading })),
      conditions: modulesOf(p, ctx.catalogue).map(({ module: m }) => m.label),
      lastCall,
      calledThisMonth: p.calls.some((c) => c.date >= monthStart),
      noPhone: !p.hasValidPhone,
    };
  });
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue || Number(a.classes.every((c) => c.leading)) - Number(b.classes.every((c) => c.leading)));
  await logAccess(ctx, "list_view", null, { list: "recall", count: rows.length });
  return rows;
}

/* ─── C3 Reviews due ───────────────────────────────────────────────────── */

export async function reviewsDueList(ctx: NcdContext) {
  authorize(ctx, "person_search", "review_write", "demo_write");
  const ds = await loadDataset(ctx);
  const due = ds.persons
    .filter((p) => !["died", "withdrawn", "transferred_out"].includes(statusOf(p, ctx.today)))
    .map((p) => ({ p, reviews: reviewsDue(p, ctx.catalogue, ctx.today).filter((r) => r.due || r.dueSoon) }))
    .filter((x) => x.reviews.length);
  const ids = await identities(ctx, due.map((d) => d.p.id));
  await logAccess(ctx, "list_view", null, { list: "reviews_due", count: due.length });
  return due
    .map(({ p, reviews }) => ({ identity: ids.get(p.id)!, reviews, earliest: reviews.map((r) => r.dueOn).sort()[0]! }))
    .sort((a, b) => a.earliest.localeCompare(b.earliest));
}

/* ─── F4 My patients ───────────────────────────────────────────────────── */

export async function myPanel(ctx: NcdContext, demoOn: boolean) {
  authorize(ctx, "own_panel", "clinician_visit_write");
  // Patients this clinician closed a visit for; while demo data is on, demo patients to any clinician (§10.3).
  const seen = await withNcd(
    ctx,
    "app",
    (tx) =>
      tx
        .selectDistinct({ id: ncdVisit.personId })
        .from(ncdVisit)
        .innerJoin(ncdPerson, eq(ncdPerson.id, ncdVisit.personId))
        .where(
          and(
            eq(ncdVisit.facilityId, ctx.facilityId),
            demoOn ? sql`(${ncdVisit.clinicianSavedBy} = ${ctx.userId} OR ${ncdPerson.isSynthetic})` : eq(ncdVisit.clinicianSavedBy, ctx.userId!),
          ),
        ),
    ctx.db,
  );
  const ds = await loadDataset(ctx, seen.map((s) => s.id));
  const lists = { not_leading: [] as string[], review_due: [] as string[], overdue: [] as string[] };
  for (const p of ds.persons) {
    const st = statusOf(p, ctx.today);
    if (["died", "withdrawn", "transferred_out"].includes(st)) continue;
    if (lastClasses(p, ctx.catalogue).some((c) => !c.leading && c.cls !== "not_recorded")) lists.not_leading.push(p.id);
    if (reviewsDue(p, ctx.catalogue, ctx.today).some((r) => r.due)) lists.review_due.push(p.id);
    if (st === "overdue") lists.overdue.push(p.id);
  }
  return { lists, persons: ds.persons };
}

export async function callsToday(ctx: NcdContext) {
  return withNcd(ctx, "app", (tx) => tx.select().from(ncdCall).where(and(gte(ncdCall.callDate, ctx.today), lte(ncdCall.callDate, ctx.today))), ctx.db);
}

export { CLASS_LABELS, can, classesAtVisit };

/* ─── B1–B9 Visit capture ──────────────────────────────────────────────── */

export async function visitView(ctx: NcdContext, visitId: string) {
  authorize(ctx, "nurse_visit_write", "clinician_visit_write", "person_search", "demo_write");
  const data = await withNcd(
    ctx,
    "app",
    async (tx) => {
      const [visit] = await tx.select().from(ncdVisit).where(eq(ncdVisit.id, visitId));
      if (!visit) return null;
      const obs = await tx.select().from(ncdObservation).where(eq(ncdObservation.visitId, visitId));
      const [prev] = await tx
        .select({ medicines: ncdVisit.medicines, other: ncdVisit.medicinesOtherCiphertext, date: ncdVisit.visitDate })
        .from(ncdVisit)
        .where(and(eq(ncdVisit.personId, visit.personId), eq(ncdVisit.status, "closed"), eq(ncdVisit.isInvalid, false), sql`${ncdVisit.id} <> ${visitId}`))
        .orderBy(desc(ncdVisit.visitDate), desc(ncdVisit.closedAt))
        .limit(1);
      const settings = await facilitySettings(tx, ctx);
      const [h] = await tx.select({ height: ncdPerson.heightCm }).from(ncdPerson).where(eq(ncdPerson.id, visit.personId));
      return { visit, obs, prev: prev ?? null, settings, heightCm: h?.height ?? null };
    },
    ctx.db,
  );
  if (!data) return null;
  const person = await personView(ctx, data.visit.personId);
  if (!person) return null;
  const v = data.visit;
  return {
    person,
    visit: {
      id: v.id,
      personId: v.personId,
      date: v.visitDate,
      type: v.visitType,
      stage: v.stage,
      status: v.status,
      weightKg: v.weightKg,
      bp: v.bpReadings,
      visitBp: v.visitSystolic != null ? `${v.visitSystolic}/${v.visitDiastolic}` : null,
      bmi: v.bmi,
      glucose: v.glucoseMmol != null ? { value: v.glucoseMmol, type: v.glucoseType, method: v.glucoseMethod } : null,
      hba1c: v.hba1cPercent != null ? { percent: v.hba1cPercent, resultDate: v.hba1cResultDate } : null,
      medicines: v.medicines,
      medicinesOther: dec(v.medicinesOtherCiphertext),
      medicinesConfirmedUnchanged: v.medicinesConfirmedUnchanged,
      missedDoses: v.missedDoses,
      hypoglycaemia: v.hypoglycaemia,
      medicinesObtained: v.medicinesObtained,
      notObtainedReason: v.notObtainedReason,
      nextAppointmentDate: v.nextAppointmentDate,
      disposition: v.disposition,
      nurseSavedAt: v.nurseSavedAt?.toISOString() ?? null,
      clinicianSavedAt: v.clinicianSavedAt?.toISOString() ?? null,
      observations: data.obs.map((o) => ({ registrationId: o.registrationId, code: o.code, value: o.valueText ?? o.valueNum })),
    },
    carried: data.prev ? { codes: data.prev.medicines, other: dec(data.prev.other), from: data.prev.date } : null,
    intervalsWeeks: data.settings.defaultIntervalWeeks,
    glucoseUnit: data.settings.glucoseUnit,
    heightCm: data.heightCm,
  };
}
export type VisitView = NonNullable<Awaited<ReturnType<typeof visitView>>>;

/** Details tab: identifiers decrypted for the record view (already audited by personView). */
export async function personDetails(ctx: NcdContext, personId: string) {
  authorize(ctx, "person_search", "drill_down", "recall_work", "data_quality", "demo_write");
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const [p] = await tx.select().from(ncdPerson).where(eq(ncdPerson.id, personId));
      if (!p) return null;
      const nin = dec(p.nationalIdCiphertext);
      return {
        hospitalNumber: dec(p.hospitalNumberCiphertext),
        nationalIdMasked: nin ? `•••• ${nin.slice(-4)}` : null,
        dateOfBirth: p.dateOfBirth,
        birthYear: p.birthYear,
        dobEstimated: p.dobEstimated,
        nokName: dec(p.nokNameCiphertext),
        nokPhoneMasked: (() => {
          const n = dec(p.nokPhoneCiphertext);
          return n ? mask(n) : null;
        })(),
        district: p.districtName,
        subcounty: p.subcountyName,
        parish: dec(p.parishCiphertext),
        village: dec(p.villageCiphertext),
        heightCm: p.heightCm,
        tobacco: p.tobacco,
        alcohol: p.alcohol,
        knownCvd: p.knownCvd,
        knownKidneyDisease: p.knownKidneyDisease,
        familyHistoryDiabetes: p.familyHistoryDiabetes,
        familyHistoryHypertension: p.familyHistoryHypertension,
        privacyNoticeVersion: p.privacyNoticeVersion,
        privacyNoticeAckAt: p.privacyNoticeAckAt.toISOString(),
        smsOptedOutAt: p.smsOptedOutAt?.toISOString() ?? null,
        mergedIntoId: p.mergedIntoId,
        enteredByLabel: p.enteredByLabel,
      };
    },
    ctx.db,
  );
}
