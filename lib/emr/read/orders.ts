import "server-only";

import type {
  Availability,
  EncounterOrderRow,
  MenuTest,
  PatientIdentity,
  ReasonOption,
} from "@/components/emr/orders/model";
import type { LabelData } from "@/components/emr/orders/specimen-label";
import type { ResultEntryData } from "@/components/emr/results/model";
import type { EmrAccessBasis } from "@/lib/emr/access";
import type { EmrActor } from "@/lib/emr/actor";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { FactConcept } from "@/lib/facts/types";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { formatters } from "@/components/emr/format";
import {
  ageSexWords,
  containerWords,
  labelTestWords,
  paymentWords,
  PRIORITY_WORD,
} from "@/components/emr/orders/model";
import { LAB2 } from "@/content/lab-phase-2";
import {
  conditions,
  devices,
  diagnosisTerms,
  facilityCapabilities,
  specimens,
  testCatalogue,
} from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { labLabels, labPaymentEvents } from "@/db/schema/lab-catalogue";
import { labSettings } from "@/db/schema/lab-safety";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { encounters } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { computeAgeYears } from "@/lib/age";
import { logChartAccess, resolveEmrAccess } from "@/lib/emr/access";
import { asClinicalReader, asClinicalWriter } from "@/lib/emr/db";
import {
  deriveOrderStatus,
  needsFastingChip,
  orderStatusText,
  REJECTION_REASON_TEXT,
} from "@/lib/emr/orders";
import { loadOrderRecords } from "@/lib/emr/write/orders";
import { decrypt } from "@/lib/encryption";
import { conceptDef, sensitivityFor } from "@/lib/facts/project/shared";
import { highRiskFor, paymentModeAt } from "@/lib/lab/collection-store";
import {
  labBedsideLiveFor,
  labCollectionCheckLiveFor,
  labHighRiskLiveFor,
  labHmisLiveFor,
  labOneMenuLiveFor,
  labPaymentLiveFor,
  labReferralLiveFor,
} from "@/lib/lab/feature";
import { needsHivPurpose } from "@/lib/lab/hiv-purpose";
import { currentPayment } from "@/lib/lab/one-menu";
import { menuToday } from "@/lib/lab/one-menu-read";
import { referralLinesForOrders } from "@/lib/lab/referral-read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { entryComponents } from "./results";

/**
 * The reads behind order entry and bedside collection on the clerking desk (PROMPT §5.8; gate-a
 * E.7, E.8), and the specimen label.
 *
 *  1. Owner transaction: the encounter is here and open to this clinician (the one access rule),
 *     and the patient's identity, decrypted as the chart does.
 *  2. Reader transaction (RLS decides): the facility's test menu with its availability, this
 *     visit's diagnoses (the reasons on offer), and this visit's orders with everything their
 *     derived status reads.
 *  3. The access is logged once the read has succeeded.
 */

export interface EncounterOrdersLoad {
  encounterId: string;
  patientUserId: string;
  identity: PatientIdentity;
  timeZone: string;
  menu: MenuTest[];
  reasons: ReasonOption[];
  orders: EncounterOrderRow[];
  /** Transcription screens for the orders that can take a paper or imaging report now. */
  transcribe: Record<string, ResultEntryData>;
  collectorName: string | null;
  /** Lab Phase 2 (labHighRisk, HR-1/HR-2): the encounter's high-risk warning, when the flag is on. */
  highRisk?: {
    on: boolean;
    reason: string | null;
    manual: boolean;
    procedure?: string | null;
  } | null;
}

async function identityHead(
  actor: EmrActor,
  encounterId: string,
  database?: EmrDb,
): Promise<{
  patientUserId: string;
  identity: PatientIdentity;
  dob: string | null;
  basis: EmrAccessBasis;
} | null> {
  const scope = { userId: actor.userId, hospitalId: actor.hospitalId };
  return asClinicalWriter(
    scope,
    async (tx) => {
      const [e] = await tx
        .select({ patientUserId: encounters.patientUserId })
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.hospitalId, actor.hospitalId)))
        .limit(1);
      if (!e) return null;
      const access = await resolveEmrAccess(tx, { ...scope, patientUserId: e.patientUserId });
      if (!access.allowed) return null;
      const [p] = await tx
        .select({
          mrn: patientProfiles.patientCode,
          first: patientProfiles.firstNameEncrypted,
          surname: patientProfiles.surnameEncrypted,
          sex: patientProfiles.sex,
          dob: patientProfiles.dateOfBirth,
        })
        .from(patientProfiles)
        .where(eq(patientProfiles.id, e.patientUserId))
        .limit(1);
      if (!p) return null;
      return {
        patientUserId: e.patientUserId,
        basis: access.basis,
        dob: p.dob ? String(p.dob) : null,
        identity: {
          name: `${decrypt(p.first)} ${decrypt(p.surname)}`.trim(),
          mrn: p.mrn,
          ageSex: ageSexWords(computeAgeYears(p.dob ? String(p.dob) : null), p.sex),
        },
      };
    },
    database,
  );
}

async function logRead(
  actor: EmrActor,
  patientUserId: string,
  basis: EmrAccessBasis,
  surface: string,
  database?: EmrDb,
) {
  await asClinicalWriter(
    { userId: actor.userId, hospitalId: actor.hospitalId },
    (tx) =>
      logChartAccess(tx, {
        hospitalId: actor.hospitalId,
        userId: actor.userId,
        patientUserId,
        basis,
        surface,
      }),
    database,
  );
}

const AVAILABILITY: readonly string[] = ["available", "intermittent", "unavailable"];

type TestRow = typeof testCatalogue.$inferSelect;

/** The facility's test menu from its catalogue rows and capability statuses. */
function buildTestMenu(
  tests: TestRow[],
  capRows: { id: string; status: string }[],
  hospitalId: string,
): MenuTest[] {
  const hmis = labHmisLiveFor(hospitalId);
  // A test menu entry keeps the "local" row when a hospital overrides a default by code.
  const byCode = new Map<string, TestRow>();
  for (const t of tests) if (!byCode.has(t.code) || t.hospitalId !== null) byCode.set(t.code, t);
  const caps = new Map(capRows.map((c) => [c.id, c.status]));
  return [...byCode.values()].map((t) => ({
    id: t.id,
    code: t.code,
    display: t.display,
    kind: t.kind,
    components: t.components.map((c) => conceptDef(c)?.display ?? c),
    specimenType: t.specimenType,
    container: t.container,
    fastingRequired: t.fastingRequired,
    ionising: t.ionising,
    inHouse: t.inHouse,
    favouriteRank: t.favouriteRank,
    availability: (t.capabilityId && AVAILABILITY.includes(caps.get(t.capabilityId) ?? "")
      ? caps.get(t.capabilityId)
      : "unknown") as Availability,
    restricted: t.components.some((c) => sensitivityFor(c as FactConcept, null) === "restricted"),
    needsPurpose: hmis && needsHivPurpose(t.code), // D-LAB3-21
  }));
}

/**
 * The test menu as the order sheet reads it (defaults, a local row winning by code, with
 * availability). Also the resus close-out's "Outstanding tests" (PROMPT §5.12).
 */
export async function loadTestMenu(
  tx: Pick<EmrDb, "select">,
  hospitalId: string,
): Promise<MenuTest[]> {
  const tests = await tx
    .select()
    .from(testCatalogue)
    .where(
      and(
        eq(testCatalogue.active, true),
        or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, hospitalId)),
      ),
    );
  const caps = await tx
    .select({ id: facilityCapabilities.capabilityId, status: facilityCapabilities.status })
    .from(facilityCapabilities)
    .where(eq(facilityCapabilities.hospitalId, hospitalId));
  return withToday(buildTestMenu(tests, caps, hospitalId), tx, hospitalId);
}

/**
 * Lab Phase 2 (labOneMenu): each lab test's state today from the hub; a test with no service link is hidden
 * from doctors (OM-1) and set up by the lab (§5.10). Every ordering surface's menu passes through here.
 */
async function withToday(
  menu: MenuTest[],
  tx: Pick<EmrDb, "select">,
  hospitalId: string,
): Promise<MenuTest[]> {
  if (!labOneMenuLiveFor(hospitalId)) return menu;
  const today = await menuToday(tx, hospitalId);
  return menu.flatMap((t) => {
    if (t.kind !== "lab") return [t];
    const d = today(t.code);
    return d.state === "not_linked"
      ? []
      : [{ ...t, today: { state: d.state, words: d.words, orderable: d.orderable } }];
  });
}

/**
 * Lab Phase 2 (§5.1, labBedside): a lab test whose result a device in use here also measures says so,
 * with a link to the bedside form for the surfaces that have one.
 * ponytail: any device in use at the hospital; the form itself narrows to the patient's ward.
 */
async function withBedside(
  menu: MenuTest[],
  tx: Pick<EmrDb, "select">,
  hospitalId: string,
  href: string | null,
): Promise<MenuTest[]> {
  if (!labBedsideLiveFor(hospitalId)) return menu;
  const rows = await tx
    .select({ kind: devices.kind, code: devices.testCode })
    .from(devices)
    .where(and(eq(devices.hospitalId, hospitalId), eq(devices.state, "in_use")));
  if (rows.length === 0) return menu;
  const byCode = new Map(menu.map((t) => [t.code, t]));
  const alts = rows.flatMap((r) => {
    const t = r.code ? byCode.get(r.code) : undefined;
    return t ? [{ test: t, kind: LAB2.deviceKinds[r.kind] ?? r.kind }] : [];
  });
  return menu.map((t) => {
    const alt =
      t.kind === "lab" &&
      alts.find(
        (a) => a.test.id !== t.id && a.test.components.some((c) => t.components.includes(c)),
      );
    return alt
      ? { ...t, bedside: { words: LAB2.bedsideAlternative(alt.test.display, alt.kind), href } }
      : t;
  });
}

export async function loadEncounterOrders(
  actor: EmrActor,
  encounterId: string,
  opts: { database?: EmrDb } = {},
): Promise<EncounterOrdersLoad | null> {
  const head = await identityHead(actor, encounterId, opts.database);
  if (!head) return null;
  const { patientUserId } = head;
  const scope = { userId: actor.userId, hospitalId: actor.hospitalId };

  const rec = await asClinicalReader(
    scope,
    async (tx) => {
      const tests = await tx
        .select()
        .from(testCatalogue)
        .where(
          and(
            eq(testCatalogue.active, true),
            or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, actor.hospitalId)),
          ),
        );
      const caps = await tx
        .select({ id: facilityCapabilities.capabilityId, status: facilityCapabilities.status })
        .from(facilityCapabilities)
        .where(eq(facilityCapabilities.hospitalId, actor.hospitalId));
      const dx = await tx
        .select({
          id: conditions.id,
          supersedesId: conditions.supersedesId,
          status: conditions.status,
          verification: conditions.verification,
          rank: conditions.rank,
          sensitivity: conditions.sensitivity,
          textCiphertext: conditions.textCiphertext,
          term: diagnosisTerms.display,
        })
        .from(conditions)
        .leftJoin(diagnosisTerms, eq(diagnosisTerms.id, conditions.termId))
        .where(
          and(
            eq(conditions.encounterId, encounterId),
            eq(conditions.patientUserId, patientUserId),
            eq(conditions.category, "encounter_diagnosis"),
          ),
        );
      const orderRows = await tx
        .select()
        .from(encounterOrders)
        .where(
          and(
            eq(encounterOrders.encounterId, encounterId),
            eq(encounterOrders.lifecycle, "events"),
          ),
        );
      const records = await loadOrderRecords(
        tx,
        orderRows.map((o) => o.id),
      );
      return { tests, caps, dx, orderRows, records };
    },
    opts.database,
  );

  const menuDb = opts.database ?? ((await import("@/db")).db as unknown as EmrDb);
  const menu = await withBedside(
    await withToday(buildTestMenu(rec.tests, rec.caps, actor.hospitalId), menuDb, actor.hospitalId),
    menuDb,
    actor.hospitalId,
    actor.surface === "doctor" || actor.surface === "nurse"
      ? `/${actor.surface}/patients/${patientUserId}/bedside`
      : null,
  );

  // Current versions only: not superseded, not withdrawn, not refuted.
  const superseded = new Set(rec.dx.map((d) => d.supersedesId).filter(Boolean));
  const reasons: ReasonOption[] = rec.dx
    .filter(
      (d) =>
        !superseded.has(d.id) && d.status !== "entered_in_error" && d.verification !== "refuted",
    )
    .map((d) => ({
      id: d.id,
      display: d.term ?? (d.textCiphertext ? decrypt(d.textCiphertext) : "Diagnosis"),
      primary: d.rank === "primary",
      restricted: d.sensitivity === "restricted",
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary));

  const testById = new Map(rec.tests.map((t) => [t.id, t]));
  const requesterIds = [
    ...new Set(rec.orderRows.map((o) => o.authoredByUserId).filter((x): x is string => !!x)),
  ];
  const conn = opts.database ?? ((await import("@/db")).db as unknown as EmrDb);
  const nameRows = requesterIds.length
    ? await conn
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, requesterIds))
    : [];
  const names = new Map(nameRows.map((r) => [r.id, r.name]));

  // Lab Phase 2 (§5.2): labels, payment and the high-risk warning for the collector.
  const labIds = rec.orderRows.filter((o) => o.kind === "lab").map((o) => o.id);
  const checkOn = labCollectionCheckLiveFor(actor.hospitalId);
  const payOn = labPaymentLiveFor(actor.hospitalId);
  const riskOn = labHighRiskLiveFor(actor.hospitalId);
  const lab = await labCollectionFacts(conn, actor.hospitalId, encounterId, labIds, {
    checkOn,
    payOn,
    riskOn,
  });
  const orders: EncounterOrderRow[] = [];
  const transcribe: Record<string, ResultEntryData> = {};
  for (const o of rec.orderRows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const { status } = deriveOrderStatus(o, rec.records);
    const test = o.testId ? (testById.get(o.testId) ?? null) : null;
    const rejection =
      status.state === "active" && status.rejection
        ? `Rejected: ${REJECTION_REASON_TEXT[status.rejection.reasonCode] ?? status.rejection.reasonCode} — recollect`
        : null;
    const newestSpecimen =
      (rec.records.specimens ?? [])
        .filter((s) => s.orderId === o.id)
        .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0]?.id ?? null;
    const canTranscribe =
      ["lab", "imaging", "ecg"].includes(o.kind) &&
      ["active", "collected", "in_progress"].includes(status.state);
    orders.push({
      id: o.id,
      display: o.text,
      kind: o.kind,
      priority: o.priority,
      orderedAtIso: o.createdAt.toISOString(),
      requesterName: o.authoredByUserId ? (names.get(o.authoredByUserId) ?? null) : null,
      statusText: orderStatusText(status, o.kind),
      caution: !!rejection || (status.state === "resulted" && status.review !== "legacy"),
      restricted: o.sensitivity === "restricted",
      collect:
        o.kind === "lab" && status.state === "active"
          ? {
              orderId: o.id,
              display: o.text,
              priority: o.priority,
              specimenType: test?.specimenType ?? null,
              container: test?.container ?? null,
              needsFasting: needsFastingChip(o, test),
              rejection,
              ...(checkOn || payOn || riskOn
                ? {
                    lab: {
                      checkOn,
                      labelNo: lab.labels.get(o.id) ?? null,
                      payment: payOn
                        ? {
                            state: lab.payments.get(o.id)?.state ?? "not_required",
                            mode: lab.mode,
                            receipt: lab.payments.get(o.id)?.receipt ?? null,
                          }
                        : null,
                      highRisk: lab.highRisk,
                      procedure: lab.procedure,
                    },
                  }
                : {}),
            }
          : null,
      specimenId: newestSpecimen,
      canTranscribe,
    });
    if (canTranscribe)
      transcribe[o.id] = {
        orderId: o.id,
        patientUserId,
        identity: head.identity,
        test: o.text,
        kind: o.kind,
        requisitionNo: o.requisitionNo,
        priority: o.priority,
        mode: "transcribed",
        components: entryComponents(test),
        report: null,
        communicate: null,
      };
  }

  // Lab Phase 4 (RF-11, §5.5): a referred order says where it went, when it is expected, overdue or rejected.
  if (labReferralLiveFor(actor.hospitalId)) {
    // Access to this encounter is already established (identityHead); the partner's name is not a clinician's
    // row under RLS, so the lines are read on the server's connection for these orders only.
    const conn = opts.database ?? ((await import("@/db")).db as unknown as EmrDb);
    const lines = await conn.transaction((tx) =>
      referralLinesForOrders(
        tx,
        actor.hospitalId,
        orders.filter((o) => o.kind === "lab").map((o) => o.id),
      ),
    );
    for (const o of orders) {
      const l = lines.get(o.id);
      if (l) Object.assign(o, { statusText: l.text, caution: o.caution || l.caution });
    }
  }
  await logRead(actor, patientUserId, head.basis, `emr_orders_${actor.surface}`, opts.database);
  return {
    encounterId,
    patientUserId,
    identity: head.identity,
    highRisk: riskOn
      ? {
          on: !!lab.highRisk,
          reason: lab.highRisk?.reason ?? null,
          manual: lab.highRisk?.manual ?? false,
          procedure: lab.procedure,
        }
      : null,
    timeZone: DEFAULT_TIME_ZONE,
    menu,
    reasons,
    orders,
    transcribe,
    collectorName: actor.fullName,
  };
}

/** The label for one specimen of this encounter (two identifiers, test, container, time). A
 *  restricted test's name is printed only when `include` holds the specimen id.
 *
 *  Lab Phase 2 (§5.4, ID-1): with the label check on, the id may be an ORDER of this encounter not
 *  yet collected: its live label (issued at placement) prints before collection. With the high-risk
 *  warning on, a flagged encounter's label carries the HIGH-RISK SPECIMEN box (HR-3). */
export async function loadSpecimenLabel(
  actor: EmrActor,
  encounterId: string,
  specimenId: string,
  opts: { database?: EmrDb; include?: ReadonlySet<string> } = {},
): Promise<{ data: LabelData; restricted: { id: string; label: string } | null } | null> {
  const head = await identityHead(actor, encounterId, opts.database);
  if (!head) return null;
  const checkOn = labCollectionCheckLiveFor(actor.hospitalId);
  const riskOn = labHighRiskLiveFor(actor.hospitalId);
  const order = {
    orderId: encounterOrders.id,
    test: encounterOrders.text,
    sensitivity: encounterOrders.sensitivity,
    requisitionNo: encounterOrders.requisitionNo,
    priority: encounterOrders.priority,
  };
  const row = await asClinicalReader(
    { userId: actor.userId, hospitalId: actor.hospitalId },
    async (tx) => {
      const [r] = await tx
        .select({
          ...order,
          container: specimens.container,
          collectedAt: specimens.collectedAt,
          labelNo: specimens.labelNo,
        })
        .from(specimens)
        .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
        .where(
          and(
            eq(specimens.id, specimenId),
            eq(specimens.patientUserId, head.patientUserId),
            eq(encounterOrders.encounterId, encounterId),
          ),
        )
        .limit(1);
      if (r) return r;
      if (!checkOn) return null;
      const [o] = await tx
        .select({ ...order, container: testCatalogue.container })
        .from(encounterOrders)
        .leftJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
        .where(
          and(
            eq(encounterOrders.id, specimenId),
            eq(encounterOrders.encounterId, encounterId),
            eq(encounterOrders.kind, "lab"),
          ),
        )
        .limit(1);
      return o ? { ...o, collectedAt: null, labelNo: null } : null;
    },
    opts.database,
  );
  if (!row) return null;
  // Labels and the high-risk events are read as the collection list reads them (labCollectionFacts).
  const conn = opts.database ?? ((await import("@/db")).db as unknown as EmrDb);
  const lab =
    checkOn || riskOn
      ? await conn.transaction(async (tx) => {
          const [l] =
            checkOn && !row.labelNo
              ? await tx
                  .select({ labelNo: labLabels.labelNo })
                  .from(labLabels)
                  .where(and(eq(labLabels.orderId, row.orderId), isNull(labLabels.voidedAt)))
                  .limit(1)
              : [];
          const risk = riskOn ? (await highRiskFor(tx, [encounterId])).has(encounterId) : false;
          return { labelNo: l?.labelNo ?? null, highRisk: risk };
        })
      : { labelNo: null, highRisk: false };
  const labelNo = row.labelNo ?? lab.labelNo;
  // An order is printable before collection only through its live label.
  if (!row.collectedAt && !labelNo) return null;
  await logRead(actor, head.patientUserId, head.basis, "emr_specimen_label", opts.database);
  const f = formatters(DEFAULT_TIME_ZONE);
  const restricted = row.sensitivity === "restricted";
  return {
    data: {
      identity: head.identity,
      dob: head.dob ? f.date(`${head.dob}T12:00:00Z`) : null,
      test: labelTestWords(row.test, restricted, !!opts.include?.has(specimenId)),
      container: containerWords(row.container),
      collectedAt: row.collectedAt
        ? f.dateTime(row.collectedAt.toISOString())
        : "Not yet collected",
      requisitionNo: row.requisitionNo,
      priority: row.priority ? (PRIORITY_WORD[row.priority] ?? row.priority) : null,
      labelNo,
      highRisk: lab.highRisk,
    },
    restricted: restricted ? { id: specimenId, label: row.test } : null,
  };
}

/** Lab Phase 2 (§5.2, ID-*, PY-*, HR-*): what the collector needs per lab order, read once per encounter. */
async function labCollectionFacts(
  conn: EmrDb,
  hospitalId: string,
  encounterId: string,
  orderIds: string[],
  on: { checkOn: boolean; payOn: boolean; riskOn: boolean },
) {
  const none = {
    labels: new Map<string, string>(),
    payments: new Map<string, { state: string; receipt: string | null }>(),
    mode: "off",
    highRisk: null as { manual: boolean; reason: string | null } | null,
    procedure: null as string | null,
  };
  if (!orderIds.length || !(on.checkOn || on.payOn || on.riskOn)) return none;
  return conn.transaction(async (tx) => {
    const labels = on.checkOn
      ? new Map(
          (
            await tx
              .select({ orderId: labLabels.orderId, labelNo: labLabels.labelNo })
              .from(labLabels)
              .where(and(inArray(labLabels.orderId, orderIds), isNull(labLabels.voidedAt)))
          ).map((l) => [l.orderId, l.labelNo]),
        )
      : none.labels;
    const payments = on.payOn ? await paymentsWithReceipt(tx, orderIds) : none.payments;
    const mode = on.payOn ? await paymentModeAt(tx, hospitalId) : "off";
    const risk = on.riskOn ? (await highRiskFor(tx, [encounterId])).get(encounterId) : undefined;
    const [s] = on.riskOn
      ? await tx
          .select({ p: labSettings.highRiskProcedure })
          .from(labSettings)
          .where(eq(labSettings.hospitalId, hospitalId))
      : [];
    return {
      labels,
      payments,
      mode,
      highRisk: risk ? { manual: risk.source === "manual", reason: risk.reason } : null,
      procedure: s?.p ?? null,
    };
  });
}

/** PY-*: each order's payment state now, and the receipt when it is paid (the "Paid · R-…" chip). */
async function paymentsWithReceipt(
  tx: Pick<EmrTx, "select">,
  orderIds: string[],
): Promise<Map<string, { state: string; receipt: string | null }>> {
  const rows = orderIds.length
    ? await tx
        .select({
          orderId: labPaymentEvents.orderId,
          state: labPaymentEvents.state,
          receiptNo: labPaymentEvents.receiptNo,
          recordedAt: labPaymentEvents.recordedAt,
        })
        .from(labPaymentEvents)
        .where(inArray(labPaymentEvents.orderId, orderIds))
    : [];
  return new Map(
    orderIds.map((id) => {
      const mine = rows
        .filter((r) => r.orderId === id)
        .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
      const state = currentPayment(mine);
      return [id, { state, receipt: state === "paid" ? (mine[0]?.receiptNo ?? null) : null }];
    }),
  );
}

/**
 * Lab Phase 2 (§5.4): what the request form adds, per flag: each test's clinical question (the order's
 * reason text), its payment state in words, the label check line, and the encounter's high-risk warning.
 * The caller has already passed the chart's access rule for this encounter.
 */
export async function loadLabRequestFacts(
  hospitalId: string,
  encounterId: string,
  orderIds: string[],
  opts: { database?: EmrDb } = {},
): Promise<{
  questions: Record<string, string>;
  payments: Record<string, string> | null;
  checkOn: boolean;
  highRisk: { manual: boolean } | null;
}> {
  const checkOn = labCollectionCheckLiveFor(hospitalId);
  const payOn = labPaymentLiveFor(hospitalId);
  const riskOn = labHighRiskLiveFor(hospitalId);
  const conn = opts.database ?? ((await import("@/db")).db as unknown as EmrDb);
  return conn.transaction(async (tx) => {
    const reasons = orderIds.length
      ? await tx
          .select({ id: encounterOrders.id, text: encounterOrders.reasonTextCiphertext })
          .from(encounterOrders)
          .where(
            and(
              inArray(encounterOrders.id, orderIds),
              eq(encounterOrders.encounterId, encounterId),
            ),
          )
      : [];
    const pay = payOn && orderIds.length ? await paymentsWithReceipt(tx, orderIds) : null;
    const risk = riskOn ? (await highRiskFor(tx, [encounterId])).get(encounterId) : undefined;
    return {
      questions: Object.fromEntries(
        reasons.flatMap((r) => (r.text ? [[r.id, decrypt(r.text)] as const] : [])),
      ),
      payments: pay
        ? Object.fromEntries(
            [...pay].map(([id, p]) => [
              id,
              paymentWords(p.state, p.receipt) ?? "Payment not required",
            ]),
          )
        : null,
      checkOn,
      highRisk: risk ? { manual: risk.source === "manual" } : null,
    };
  });
}
