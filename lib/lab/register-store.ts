import "server-only";

import type { RegisterConfig, RegisterLine } from "./register";
import type { SectionKey } from "./test-menu";
import type { PatientIdentity } from "@/components/emr/orders/model";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";

import { dateWords, timeWords } from "@/app/lab/_lib/days";
import { specimenWords } from "@/components/emr/orders/model";
import { fill, LAB3_HIV_PURPOSE, LAB3_REGISTER } from "@/content/lab-phase-3";
import {
  clinicalObservations,
  diagnosticOfferings,
  diagnosticReports,
  downtimeEntries,
  encounterOrders,
  encounters,
  hospitalDepartments,
  labLabels,
  labRegisterPrints,
  labSignedConfigs,
  specimenEvents,
  specimens,
  testCatalogue,
  users,
} from "@/db/schema";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { EmrWriteError } from "@/lib/emr/write/context";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { loadConfigs } from "./catalogue-v2";
import { analyteName } from "./qc-store";
import { printEvent } from "./register";
import { inForce } from "./signed-config";
import { addDays, endOfDay } from "./stock";
import { sectionFor, sectionOfUnit } from "./test-menu";

/**
 * The daily register on the database (Lab Phase 3 Step 9, §6.10 DR-1..DR-5; GATE A §3.1 `register_config`,
 * §4, §10; 0117 `lab_register_prints`). One read of the day's received, released and rejected lines for a
 * section; the pure `dailyRegister` chooses and lays them out. Columns are the lead's signed configuration, or
 * the canvas defaults until the paper registers are photographed (OA-3).
 */

type Actor = { userId: string; hospitalId: string };
const TZ = DEFAULT_TIME_ZONE;
const RELEASED = ["final", "amended", "corrected"];

export const REGISTERS = [
  "general",
  "hiv",
  "tb",
  "mental_health",
  "sexual_reproductive_health",
] as const;
export type RegisterKind = (typeof REGISTERS)[number];

/** DR-3, GATE A §4: "users with HIV access" (and every other class) = lab staff who release results. */
export const classAccessFor = (permissions: ReadonlySet<string> | readonly string[]) =>
  [...permissions].includes("lab.result.release") ? REGISTERS.filter((r) => r !== "general") : [];

const C = LAB3_REGISTER.columns;
type Key = keyof typeof C;
const cols = (keys: Key[]) => keys.map((key) => ({ key, label: C[key] }));
/** GATE A §10: defaults only (the canvas's columns; the 055A4 HIV register's were not obtained, H4). */
export const REGISTER_DEFAULTS: Record<"general" | "hiv", RegisterConfig> = {
  general: {
    columns: cols([
      "labNo",
      "received",
      "patient",
      "hospitalNo",
      "age",
      "sex",
      "ward",
      "specimen",
      "test",
      "result",
      "doneBy",
      "released",
    ]),
  },
  hiv: {
    columns: cols([
      "labNo",
      "date",
      "patient",
      "hospitalNo",
      "age",
      "sex",
      "purpose",
      "kit1",
      "kit2",
      "kit3",
      "outcome",
      "tester",
      "released",
    ]),
  },
};
export const columnChoices = (register: RegisterKind) =>
  cols(Object.keys(C) as Key[]).filter((c) =>
    register === "hiv"
      ? true
      : !["purpose", "kit1", "kit2", "kit3", "outcome", "tester"].includes(c.key),
  );

/** DR-2: the signed columns for this register (a class register falls back to the general one), or defaults. */
export async function registerConfigFor(
  tx: EmrTx,
  hospitalId: string,
  register: RegisterKind,
  now: Date,
) {
  const configs = await loadConfigs(tx, hospitalId);
  const signed =
    inForce(configs, "register_config", register, now) ??
    (register === "hiv" ? null : inForce(configs, "register_config", "general", now));
  const [draft] = await tx
    .select({
      id: labSignedConfigs.id,
      payload: labSignedConfigs.payload,
      authoredBy: labSignedConfigs.authoredBy,
    })
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.hospitalId, hospitalId),
        eq(labSignedConfigs.kind, "register_config"),
        eq(labSignedConfigs.key, register),
        eq(labSignedConfigs.status, "draft"),
      ),
    )
    .orderBy(desc(labSignedConfigs.version))
    .limit(1);
  return {
    config: signed?.payload ?? REGISTER_DEFAULTS[register === "hiv" ? "hiv" : "general"],
    signed: signed ? { id: signed.id, version: signed.version } : null,
    draft: draft
      ? { id: draft.id, payload: draft.payload as RegisterConfig, authoredBy: draft.authoredBy }
      : null,
  };
}

/** A register line before the patient's identity is revealed by the page (audited, once per page). */
export type RawLine = Omit<RegisterLine, "values"> & {
  patientUserId: string;
  values: Record<string, string>;
};

/** DR-1, DR-5: the day's lines for one section, every class (the engine keeps restricted classes apart). */
export async function loadRegisterDay(
  tx: EmrTx,
  hospitalId: string,
  input: { sectionId: string; day: string },
): Promise<RawLine[]> {
  const from = endOfDay(addDays(input.day, -1), TZ);
  const to = endOfDay(input.day, TZ);
  const inDay = (c: Parameters<typeof gte>[0]) => and(gte(c, from), lt(c, to));

  // The orders the day touches: received or rejected specimens, releases and amendments, downtime form times.
  const [fromEvents, fromReports] = await Promise.all([
    tx
      .selectDistinct({ orderId: specimens.orderId })
      .from(specimenEvents)
      .innerJoin(specimens, eq(specimens.id, specimenEvents.specimenId))
      .where(
        and(
          eq(specimenEvents.hospitalId, hospitalId),
          inArray(specimenEvents.kind, ["received", "rejected"]),
          inDay(specimenEvents.recordedAt),
        ),
      ),
    tx
      .selectDistinct({ orderId: diagnosticReports.orderId })
      .from(diagnosticReports)
      .leftJoin(downtimeEntries, eq(downtimeEntries.reportId, diagnosticReports.id))
      .where(
        and(
          eq(diagnosticReports.hospitalId, hospitalId),
          eq(diagnosticReports.kind, "lab"),
          inArray(diagnosticReports.status, RELEASED),
          or(inDay(diagnosticReports.recordedAt), inDay(downtimeEntries.resultedAt)),
        ),
      ),
  ]);
  const orderIds = [
    ...new Set(
      [...fromEvents, ...fromReports].map((r) => r.orderId).filter((o): o is string => !!o),
    ),
  ];
  if (!orderIds.length) return [];

  const [orders, specimenRows, events, reports, labels] = await Promise.all([
    tx
      .select({
        id: encounterOrders.id,
        patientUserId: encounterOrders.patientUserId,
        purpose: encounterOrders.testPurpose,
        test: testCatalogue.display,
        restrictedClass: testCatalogue.restrictedClass,
        sectionId: diagnosticOfferings.sectionId,
        sectionOverride: diagnosticOfferings.sectionOverride,
        section: testCatalogue.section,
        encounterType: encounters.encounterType,
        department: hospitalDepartments.name,
      })
      .from(encounterOrders)
      .innerJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
      .innerJoin(encounters, eq(encounters.id, encounterOrders.encounterId))
      .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, encounters.departmentId))
      // Lab test menu v2 (TM-3): the offering is keyed by the test itself.
      .leftJoin(
        diagnosticOfferings,
        and(
          eq(diagnosticOfferings.hospitalId, encounterOrders.hospitalId),
          eq(diagnosticOfferings.kind, "lab"),
          eq(diagnosticOfferings.code, testCatalogue.code),
        ),
      )
      .where(
        and(eq(encounterOrders.hospitalId, hospitalId), inArray(encounterOrders.id, orderIds)),
      ),
    tx
      .select({ id: specimens.id, orderId: specimens.orderId, type: specimens.specimenType })
      .from(specimens)
      .where(and(eq(specimens.hospitalId, hospitalId), inArray(specimens.orderId, orderIds))),
    tx
      .select({
        specimenId: specimenEvents.specimenId,
        kind: specimenEvents.kind,
        at: specimenEvents.recordedAt,
        reasonCode: specimenEvents.reasonCode,
      })
      .from(specimenEvents)
      .innerJoin(specimens, eq(specimens.id, specimenEvents.specimenId))
      .where(
        and(
          inArray(specimens.orderId, orderIds),
          inArray(specimenEvents.kind, ["received", "rejected"]),
        ),
      ),
    tx
      .select({
        id: diagnosticReports.id,
        orderId: diagnosticReports.orderId,
        specimenId: diagnosticReports.specimenId,
        version: diagnosticReports.version,
        status: diagnosticReports.status,
        performer: diagnosticReports.performer,
        at: diagnosticReports.recordedAt,
        formAt: downtimeEntries.resultedAt,
        by: users.fullName,
      })
      .from(diagnosticReports)
      .leftJoin(downtimeEntries, eq(downtimeEntries.reportId, diagnosticReports.id))
      .leftJoin(users, eq(users.id, diagnosticReports.recordedByUserId))
      .where(
        and(
          eq(diagnosticReports.hospitalId, hospitalId),
          inArray(diagnosticReports.orderId, orderIds),
          inArray(diagnosticReports.status, RELEASED),
        ),
      )
      .orderBy(diagnosticReports.version),
    tx
      .select({ orderId: labLabels.orderId, labelNo: labLabels.labelNo })
      .from(labLabels)
      .where(and(inArray(labLabels.orderId, orderIds), isNull(labLabels.voidedAt))),
  ]);
  const reportIds = reports.map((r) => r.id);
  const obs = reportIds.length
    ? await tx
        .select({
          id: clinicalObservations.id,
          reportId: clinicalObservations.reportId,
          conceptId: clinicalObservations.conceptId,
          num: clinicalObservations.valueNum,
          unit: clinicalObservations.valueUnit,
          code: clinicalObservations.valueCode,
          status: clinicalObservations.status,
          supersedesId: clinicalObservations.supersedesId,
          context: clinicalObservations.context,
        })
        .from(clinicalObservations)
        .where(inArray(clinicalObservations.reportId, reportIds))
    : [];
  const algorithmIds = [
    ...new Set(
      obs
        .map((o) => (o.context as { algorithmId?: string } | null)?.algorithmId)
        .filter((x): x is string => !!x),
    ),
  ];
  const kits = new Map(
    (algorithmIds.length
      ? await tx
          .select({ id: labSignedConfigs.id, payload: labSignedConfigs.payload })
          .from(labSignedConfigs)
          .where(inArray(labSignedConfigs.id, algorithmIds))
      : []
    ).map((a) => [a.id, (a.payload as { assays: { step: number; kit: string }[] }).assays]),
  );

  const words = (s: string | null) => (s ?? "").replaceAll("_", " ");
  const valuesOf = (reportId: string) => {
    const rows = obs.filter((o) => o.reportId === reportId);
    const superseded = new Set(rows.map((o) => o.supersedesId));
    const current = rows.filter((o) => !superseded.has(o.id) && RELEASED.includes(o.status ?? ""));
    const outcome = current.find((o) => o.conceptId === "obs.hiv_algorithm_outcome");
    const assays =
      kits.get((outcome?.context as { algorithmId?: string } | null)?.algorithmId ?? "") ?? [];
    const kit = (step: number) => {
      const o = current.find((x) => x.conceptId === `obs.hiv_rdt_t${step}`);
      if (!o) return "";
      const name = assays.find((a) => a.step === step)?.kit;
      return `${name ? `${name}: ` : ""}${words(o.code)}`;
    };
    return {
      result: current
        .filter((o) => o.conceptId !== "obs.hiv_algorithm_outcome")
        .map(
          (o) =>
            `${analyteName(o.conceptId ?? "")} ${o.num !== null ? `${o.num}${o.unit ? ` ${o.unit}` : ""}` : words(o.code)}`,
        )
        .join("; "),
      kit1: kit(1),
      kit2: kit(2),
      kit3: kit(3),
      outcome: words(outcome?.code ?? null),
    };
  };

  // TM-4: a legacy row's own unit, else the test's effective section matched to this unit's A.3 code.
  const [unit] = await tx
    .select({ code: hospitalDepartments.catalogueCode })
    .from(hospitalDepartments)
    .where(eq(hospitalDepartments.id, input.sectionId));
  const key = sectionOfUnit(unit?.code ?? null);
  const inSection = (o: (typeof orders)[number]) =>
    o.sectionId
      ? o.sectionId === input.sectionId
      : !!key &&
        sectionFor(
          { sectionOverride: o.sectionOverride as SectionKey | null },
          {
            section: o.section as SectionKey | null,
          },
        ) === key;
  const orderOf = new Map(orders.map((o) => [o.id, o]));
  const labelOf = new Map(labels.map((l) => [l.orderId, l.labelNo]));
  const lines: RawLine[] = [];
  for (const sp of specimenRows) {
    const o = orderOf.get(sp.orderId);
    if (!o || !inSection(o)) continue;
    const mine = events.filter((e) => e.specimenId === sp.id);
    const received = mine
      .filter((e) => e.kind === "received")
      .map((e) => e.at)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const rejected = mine.find((e) => e.kind === "rejected");
    if (!received && !rejected) continue;
    const base = {
      hospitalId,
      sectionId: input.sectionId,
      labNumber: labelOf.get(o.id) ?? "—",
      receivedAt: received ?? rejected!.at,
      restrictedClass: o.restrictedClass,
      patientUserId: o.patientUserId,
    };
    const common = {
      labNo: base.labNumber,
      received: received ? timeWords(received) : "—",
      date: dateWords(base.receivedAt),
      ward: o.encounterType === "inpatient" ? (o.department ?? "") : LAB3_REGISTER.opd,
      specimen: specimenWords(sp.type) ?? "",
      test: o.test,
      purpose: o.purpose
        ? (LAB3_HIV_PURPOSE.words[o.purpose as keyof typeof LAB3_HIV_PURPOSE.words] ?? o.purpose)
        : "",
    };
    if (rejected) {
      lines.push({
        ...base,
        outcome: { kind: "rejected", at: rejected.at },
        values: {
          ...common,
          result: fill(LAB3_REGISTER.rejected, {
            reason: REJECTION_REASON_TEXT[rejected.reasonCode ?? ""] ?? words(rejected.reasonCode),
          }),
          released: "—",
        },
      });
      continue;
    }
    const versions = reports.filter(
      (r) =>
        r.orderId === o.id &&
        r.performer === "in_house" &&
        (!r.specimenId || r.specimenId === sp.id),
    );
    const first = versions[0];
    const current = versions.at(-1);
    if (!first || !current) {
      lines.push({ ...base, outcome: null, values: { ...common, released: "—" } });
      continue;
    }
    // DR-5: shown as released now; each later amendment also sits on the day it was made, marked Amended.
    const v = valuesOf(current.id);
    const released = (at: Date) => ({
      ...v,
      doneBy: first.by ?? "",
      tester: first.by ?? "",
      released: timeWords(at),
    });
    lines.push({
      ...base,
      outcome: { kind: "released", at: first.at, formAt: first.formAt, amended: false },
      values: { ...common, ...released(first.formAt ?? first.at) },
    });
    for (const later of versions.slice(1).filter((r) => r.status !== "final"))
      lines.push({
        ...base,
        receivedAt: later.at,
        outcome: { kind: "released", at: later.at, formAt: null, amended: true },
        values: { ...common, ...released(later.at), doneBy: later.by ?? "" },
      });
  }
  return lines;
}

/** Fills the two identifiers, age and sex from the page's audited reveal (Law 12). */
export const withIdentities = (
  lines: readonly RawLine[],
  ids: ReadonlyMap<string, PatientIdentity>,
): RegisterLine[] =>
  lines.map(({ patientUserId, ...l }) => {
    const id = ids.get(patientUserId);
    const [age = "", sex = ""] = (id?.ageSex ?? "").split(" · ");
    return {
      ...l,
      values: {
        ...l.values,
        patient: id?.name ?? "Name withheld",
        hospitalNo: id?.mrn ?? "",
        age,
        sex,
      },
    };
  });

/** ponytail: a fixed rows-per-sheet estimate for A4 landscape at 12 px; measure the printed page if it drifts. */
export const ROWS_PER_PAGE = 18;

/** DR-3, DR-4: each print writes a print event; a class register only for those with that access. */
export async function recordPrint(
  tx: EmrTx,
  a: Actor,
  input: {
    register: RegisterKind;
    sectionId: string;
    day: string;
    rows: number;
    classAccess: readonly string[];
  },
  now: Date,
): Promise<string> {
  if (input.register !== "general" && !input.classAccess.includes(input.register))
    throw new EmrWriteError("forbidden", LAB3_REGISTER.noAccess);
  const { signed } = await registerConfigFor(tx, a.hospitalId, input.register, now);
  const e = printEvent({
    ...input,
    hospitalId: a.hospitalId,
    rowsPerPage: ROWS_PER_PAGE,
    printedBy: a.userId,
    printedAt: now,
  });
  const [row] = await tx
    .insert(labRegisterPrints)
    .values({
      ...e,
      configId: signed?.id ?? null,
      configVersion: signed?.version ?? null,
    })
    .returning({ id: labRegisterPrints.id });
  return row!.id;
}
