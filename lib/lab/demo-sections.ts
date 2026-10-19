import "server-only";

import type { DemoState } from "./demo";
import type { EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { withPatientWrite } from "@/lib/emr/write/context";
import { enterResults } from "@/lib/emr/write/results";
import { rejectSpecimen } from "@/lib/emr/write/specimens";
import { rowsOf } from "@/lib/exchange/store";
import { recordIpcAction } from "@/lib/ipc/store";
import { recordCompetency, recordDeviceCheck, setStripLotRanges } from "./bedside-quality-store";
import { addLot, registerDevice, setDeviceState, setOperator } from "./bedside-store";
import { saveConfigDraft, signConfig } from "./catalogue-v2";
import { saveResponseDraft, setContacts, signResponseVersion } from "./criticals/setup";
import { logCriticalCall, releaseWithCriticalMark } from "./criticals/store";
import {
  bandFor,
  bump,
  collect,
  DAY,
  key,
  newPatient,
  placeOrder,
  receive,
  review,
  runTest,
  valuesFor,
} from "./demo";
import { recordPeriod, reserveFormNumbers } from "./downtime-store";
import { recordEqaResults, recordEqaScores, recordRound, saveScheme } from "./eqa-store";
import {
  markDown,
  recordLog,
  recordTemperature,
  saveEquipment,
  saveSchedule,
} from "./equipment-store";
import { labStockLiveFor } from "./feature";
import { labTests, saveRangeDraft, signRangeVersion } from "./measures-setup";
import { recordQcRun } from "./qc-store";
import { fillMeasuresFromResearch } from "./research-measures";
import { researchText } from "./research-store";
import { grandfatherLots, issueStock, receiveDelivery, saveItem, setLotInUse } from "./stock-store";

type Section = [string, (s: DemoState) => Promise<void>];
const tx = <T>(s: DemoState, fn: (t: EmrTx) => Promise<T>) =>
  s.db.transaction((t) => fn(t as EmrTx));
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Draft by Demo author, signed by Demo lab lead and (unless lead-only) countersigned by Demo CSO. */
async function signDemo(
  s: DemoState,
  kind: string,
  k: string,
  payload: unknown,
  o: {
    leadOnly?: boolean;
    first?: "lead" | "dp_lead" | "ipc_lead";
    second?: "cso" | "lab_counter";
  } = {},
) {
  const first = o.first ?? "lead";
  const firstUser =
    first === "dp_lead" ? s.people.dp : first === "ipc_lead" ? s.people.ipcLead : s.people.lead;
  const id = await tx(s, (t) =>
    saveConfigDraft(
      t,
      { userId: s.people.author, hospitalId: s.h },
      { kind: kind as never, key: k, payload },
      s.now,
    ),
  );
  await tx(s, (t) =>
    signConfig(
      t,
      { userId: firstUser, hospitalId: s.h, as: first },
      { configId: id, exceptionNote: null },
      s.now,
    ),
  );
  if (!o.leadOnly) {
    const second = o.second ?? "cso";
    await tx(s, (t) =>
      signConfig(
        t,
        { userId: second === "cso" ? s.people.cso : s.people.lead, hospitalId: s.h, as: second },
        { configId: id, exceptionNote: null },
        s.now,
      ),
    );
  }
  // Demo results are back-dated by days; the demo's rules have been in force since before them.
  await s.db.execute(
    sql`UPDATE lab_signed_configs SET in_force_from = now() - interval '60 days' WHERE id = ${id} AND status = 'signed'`,
  );
  bump(s, "signed settings");
  return id;
}

const testByCode = async (s: DemoState, code: string) =>
  rowsOf<{ id: string; display: string }>(
    await s.db.execute(
      sql`SELECT id, display FROM test_catalogue WHERE code = ${code} AND hospital_id IS NULL AND active`,
    ),
  )[0] ?? null;

/* ─── Before the worklist: catalogue, ranges, critical set-up ────────── */

async function catalogue(s: DemoState) {
  const r = await tx(s, (t) =>
    fillMeasuresFromResearch(t, { userId: s.lab.userId, hospitalId: s.h }, s.now),
  );
  bump(s, "units filled", r.filled);
}

/** The research's published reference ranges, where the unit matches this hospital's measure. */
async function ranges(s: DemoState) {
  type R = {
    concept: string;
    unit: string;
    kind: string;
    bands: {
      sex: string;
      ageFromDays: number | null;
      ageToDays: number | null;
      low: number | null;
      high: number | null;
      source?: { citation?: string };
    }[];
  };
  const research = (JSON.parse(researchText()) as { ranges: R[] }).ranges.filter(
    (r) => r.kind === "reference",
  );
  const tests = await tx(s, (t) => labTests(t, s.h));
  const measures = rowsOf<{ test: string; concept: string; unit: string | null }>(
    await s.db
      .execute(sql`SELECT test_id AS test, concept_id AS concept, unit_ucum AS unit FROM lab_component_measures
      WHERE hospital_id = ${s.h} AND superseded_by IS NULL AND result_type = 'number'`),
  );
  const signed = new Set(
    rowsOf<{ k: string }>(
      await s.db.execute(sql`SELECT test_id || ':' || concept_id AS k FROM reference_range_versions
        WHERE hospital_id = ${s.h} AND status = 'signed'`),
    ).map((r) => r.k),
  );
  for (const m of measures) {
    if (signed.has(`${m.test}:${m.concept}`) || !tests.some((t) => t.id === m.test)) continue;
    const r = research.find((x) => x.concept === m.concept && x.unit === m.unit);
    if (!r) continue;
    // The research lists alternative bands per sex (several studies and strands); MedSync refuses overlaps. Keep one
    // adult band per sex, the research's highest-confidence one, and drop "any" where sex-specific bands exist.
    // Prefer a band with both ends (a reference interval, not a one-sided diagnostic threshold), then confidence.
    const conf: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const rank = (b: R["bands"][number]) =>
      (b.low !== null && b.high !== null ? 0 : 10) +
      (conf[(b as { confidence?: string }).confidence ?? ""] ?? 3);
    const adult = r.bands.filter(
      (b) => (b.low !== null || b.high !== null) && (b.ageToDays === null || b.ageToDays > 6570),
    );
    const bySex = new Map<string, R["bands"][number]>();
    for (const b of [...adult].sort((x, y) => rank(x) - rank(y))) {
      const sx = b.sex === "female" || b.sex === "male" ? b.sex : "any";
      if (!bySex.has(sx)) bySex.set(sx, b);
    }
    if (bySex.has("female") || bySex.has("male")) bySex.delete("any");
    const bands = [...bySex.entries()].map(([sx, b]) => ({
      sex: sx as "female" | "male" | "any",
      ageFromDays: b.ageFromDays,
      ageToDays: b.ageToDays,
      low: b.low === null ? null : String(b.low),
      high: b.high === null ? null : String(b.high),
      source: (b.source?.citation ?? "MedSync catalogue research").slice(0, 480),
    }));
    if (!bands.length) continue;
    try {
      const v = await tx(s, (t) =>
        saveRangeDraft(
          t,
          { userId: s.people.author, hospitalId: s.h },
          { testId: m.test, conceptId: m.concept, bands },
          s.now,
        ),
      );
      await tx(s, (t) =>
        signRangeVersion(
          t,
          { userId: s.people.lead, hospitalId: s.h, as: "lead" },
          { versionId: v, exceptionNote: null },
          s.now,
        ),
      );
      await tx(s, (t) =>
        signRangeVersion(
          t,
          { userId: s.people.cso, hospitalId: s.h, as: "cso" },
          { versionId: v, exceptionNote: null },
          s.now,
        ),
      );
      await s.db.execute(
        sql`UPDATE reference_range_versions SET in_force_from = now() - interval '60 days' WHERE id = ${v}`,
      );
      bump(s, "ranges signed");
    } catch {
      bump(s, "ranges skipped");
    }
  }
}

async function criticalSetup(s: DemoState) {
  const signedAlready = rowsOf<{ ok: number }>(
    await s.db.execute(
      sql`SELECT 1 AS ok FROM critical_response_versions WHERE hospital_id = ${s.h} AND status = 'signed'`,
    ),
  ).length;
  if (!signedAlready) {
    const v = await tx(s, (t) =>
      saveResponseDraft(
        t,
        { userId: s.people.author, hospitalId: s.h },
        {
          ackWithinMin: 15,
          level1AfterMin: 15,
          level2AfterMin: 15,
          source: "Demo: illustrative response times for the demo hospital",
        },
      ),
    );
    await tx(s, (t) =>
      signResponseVersion(
        t,
        { userId: s.people.lead, hospitalId: s.h, as: "lead" },
        { versionId: v, exceptionNote: null },
        s.now,
      ),
    );
    await tx(s, (t) =>
      signResponseVersion(
        t,
        { userId: s.people.cso, hospitalId: s.h, as: "cso" },
        { versionId: v, exceptionNote: null },
        s.now,
      ),
    );
  }
  await tx(s, (t) =>
    setContacts(
      t,
      { userId: s.lab.userId, hospitalId: s.h },
      { departmentId: s.doctor.dept, level: 1, userIds: [s.doctor.id] },
      s.now,
    ),
  );
  await tx(s, (t) =>
    setContacts(
      t,
      { userId: s.lab.userId, hospitalId: s.h },
      { departmentId: null, level: 2, userIds: [s.doctor.id] },
      s.now,
    ),
  );
}

/* ─── After the worklist: every other page ───────────────────────────── */

async function rejected(s: DemoState) {
  const reasons = ["haemolysed", "clotted", "insufficient"] as const;
  for (const reasonCode of reasons) {
    const p = await newPatient(s);
    const orderId = await placeOrder(s, p, s.tests[0]!.id, new Date(s.now.getTime() - DAY));
    const sp = await collect(s, p, orderId, new Date(s.now.getTime() - DAY));
    await receive(s, p, sp);
    await withPatientWrite(
      s.lab,
      p.id,
      (ctx) =>
        rejectSpecimen(ctx, { patientUserId: p.id, specimenId: sp, clientKey: key(), reasonCode }),
      { database: s.db },
    );
    bump(s, "rejected");
  }
}

/** Two manually marked critical values: one acknowledged by phone with read-back, one still open. */
async function criticals(s: DemoState) {
  const t = s.tests[0]!;
  for (const acknowledge of [true, false]) {
    const p = await newPatient(s);
    const high = valuesFor(t, p.sex, 3)!;
    const r = await runTest(s, p, t, { values: high, stop: "preliminary" });
    const out = await withPatientWrite(
      s.lab,
      p.id,
      (ctx) =>
        releaseWithCriticalMark(ctx, {
          patientUserId: p.id,
          orderId: r.orderId,
          reportId: r.reportId!,
          marks: [
            {
              conceptId: high[0]!.conceptId,
              check: { kind: "repeated", repeatValue: high[0]!.value! },
              sampleChecked: true,
            },
          ],
          note: "Demo critical value",
          clientKey: key(),
        }),
      { database: s.db },
    );
    bump(s, "critical alerts");
    if (acknowledge && out.alert?.alertId)
      await tx(s, (tt) =>
        logCriticalCall(tt, s.lab, {
          alertId: out.alert!.alertId!,
          to: { userId: s.doctor.id },
          readBack: true,
          now: new Date(),
        }),
      );
  }
}

/** A signed delta rule and a patient whose new result moved far beyond it, waiting for the lab's decision. */
async function delta(s: DemoState) {
  const t = s.tests[0]!;
  const c = t.components[0]!;
  const p = await newPatient(s);
  const b = bandFor(c, p.sex)!;
  await signDemo(s, "delta_rule", `DEMO-${c.conceptId.replace("obs.", "").toUpperCase()}`, {
    concept: c.conceptId,
    type: "absolute",
    limit: { both: Number(((b.high - b.low) * 0.75).toFixed(Math.max(0, c.decimals ?? 1))) },
    windowHours: 24 * 7,
    basis: {
      kind: "clinical",
      approver: "Demo lab lead",
      rationale: "Demo: three quarters of the reference band, for illustration",
    },
    applicability: { ageFromYears: null, ageToYears: null, specimen: null },
    acrossMethods: false,
    meaning: "Demo: may be another patient's sample",
    source: "Demo rule for the demo hospital",
  });
  const before = await runTest(s, p, t, { at: new Date(s.now.getTime() - 3 * DAY) });
  if (before.reportId) await review(s, p, before.reportId);
  await runTest(s, p, t, { values: valuesFor(t, p.sex, 2.2)!, stop: "preliminary" });
  bump(s, "delta checks");
}

/** The signed release table, consent, and reviewed results, so the doctor's "The patient sees it" and the app fill. */
async function patientRelease(s: DemoState) {
  await signDemo(s, "patient_release", "hospital", {
    groups: {
      routine: { inApp: "after_review", sms: true },
      critical: { inApp: "after_told", sms: false },
      referred: { inApp: "after_review", sms: true },
      bedside: { inApp: "after_review", sms: false },
      corrected: { inApp: "after_review", sms: false },
    },
    holdMaxDays: 30,
    agedWindowDays: 7,
    source: { doc: "Demo release table for the demo hospital", date: day(s.now) },
  });
  for (const p of s.patients.slice(0, 10))
    await s.db
      .execute(sql`INSERT INTO consent_records (user_id, consent_type, version, consent_text_sha256)
      VALUES (${p.id}, 'results_in_app', 'demo', ${"0".repeat(64)}) ON CONFLICT DO NOTHING`);
  const t = s.tests[0]!;
  for (let i = 0; i < 3; i++) {
    const p = await newPatient(s);
    await s.db
      .execute(sql`INSERT INTO consent_records (user_id, consent_type, version, consent_text_sha256)
      VALUES (${p.id}, 'results_in_app', 'demo', ${"0".repeat(64)}) ON CONFLICT DO NOTHING`);
    const r = await runTest(s, p, t, {
      values: valuesFor(t, p.sex, i === 1 ? 1.2 : 0.5)!,
      at: new Date(s.now.getTime() - i * DAY),
    });
    if (r.reportId && i < 2) await review(s, p, r.reportId);
  }
  bump(s, "patient results");
}

/** A partner lab, a referred test on a sealed and handed-over manifest. */
async function referral(s: DemoState) {
  const tsh = await testByCode(s, "test.thyroid");
  if (!tsh) throw new Error("no thyroid test in the catalogue to refer");
  const [{ code } = { code: "" }] = rowsOf<{ code: string }>(
    await s.db.execute(sql`SELECT code FROM test_catalogue WHERE id = ${tsh.id}`),
  );
  await s.db
    .execute(sql`INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, stated_tat, referred_to, confirmed_at)
    VALUES (${s.h}, 'lab', 'DEMO-REF-TFT', 'referred', '3 days', 'Demo reference lab', now()) ON CONFLICT DO NOTHING`);
  await s.db
    .execute(sql`INSERT INTO lab_test_services (hospital_id, test_code, offering_code, set_by)
    VALUES (${s.h}, ${code}, 'DEMO-REF-TFT', ${s.lab.userId}) ON CONFLICT DO NOTHING`);
  const { savePartner, addToManifest, sealManifest, recordHandover } =
    await import("./referral-store");
  const partnerId = await tx(s, (t) =>
    savePartner(
      t,
      { userId: s.lab.userId, hospitalId: s.h },
      {
        name: "Demo reference lab",
        kind: "private_lab",
        contacts: [{ role: "Reception", name: "Demo contact" }],
        transport: [{ code: "courier", words: "Their courier" }],
        resultsReturn: [{ channel: "paper", words: "Paper with the courier" }],
        active: true,
      } as never,
      s.now,
    ),
  );
  await signDemo(
    s,
    "partner_tests",
    partnerId,
    {
      tests: [
        {
          testCode: code,
          theirCode: "DEMO-TFT",
          category: "serum",
          turnaround: { value: 3, unit: "days" },
          requiredIds: [{ key: "form", words: "Their form number", symbologies: ["code128"] }],
        },
      ],
      holidays: [],
      source: { doc: "Demo partner price list", date: day(s.now) },
    },
    { leadOnly: true },
  );
  await signDemo(
    s,
    "partner_packing",
    `${partnerId}:serum`,
    {
      category: "serum",
      items: [
        { key: "triple", words: "Triple packaging" },
        { key: "forms", words: "Forms outside the tubes" },
      ],
      source: { doc: "Demo packing list", date: day(s.now) },
    },
    { leadOnly: true },
  );
  await signDemo(
    s,
    "partner_legal",
    partnerId,
    {
      basis: "s7_2_d",
      agreement: { ref: "DEMO-AGR", signedOn: "2026-01-01", reviewOn: "2027-12-31" },
      processorTerms: true,
      crossBorder: false,
      perPatientConsent: false,
      pdpo: { ref: "DEMO-PDPO", renewOn: "2027-12-31" },
      breachContact: "Demo data protection officer",
    },
    { leadOnly: true, first: "dp_lead" },
  );
  await signDemo(
    s,
    "partner_fields",
    partnerId,
    { fields: ["hospital_number", "name", "birth_date", "lab_number"], clinicalQuestion: false },
    { leadOnly: true, first: "dp_lead" },
  );
  const specimens: { specimenId: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const p = await newPatient(s);
    const orderId = await placeOrder(s, p, tsh.id, new Date(s.now.getTime() - 2 * DAY));
    const sp = await collect(s, p, orderId, new Date(s.now.getTime() - 2 * DAY));
    await receive(s, p, sp);
    specimens.push({ specimenId: sp });
  }
  const a = { userId: s.lab.userId, hospitalId: s.h, cadreCode: s.lab.cadreCode };
  const manifestId = await tx(s, (t) =>
    addToManifest(
      t,
      a,
      {
        partnerId,
        transport: "Their courier",
        items: specimens.slice(0, 2).map((x, i) => ({
          specimenId: x.specimenId,
          externalIds: { form: `DEMO-RL-${1000 + i}` },
          packing: ["triple", "forms"],
          consentRef: null,
        })),
        clientKey: key(),
      },
      s.now,
    ),
  );
  await tx(s, (t) => sealManifest(t, a, { manifestId, packages: 1 }, s.now));
  await tx(s, (t) =>
    recordHandover(t, a, { manifestId, handedTo: "Demo courier", handedAt: new Date() }, s.now),
  );
  bump(s, "referrals", 2);
}

/** A signed alert-list entry and a released Xpert result that raises an infection prevention alert. */
async function ipc(s: DemoState) {
  const xpert = await testByCode(s, "test.tb_xpert");
  if (!xpert) throw new Error("no Xpert test in the catalogue");
  await signDemo(
    s,
    "ipc_alert_entry",
    "demo_rr_tb",
    {
      scope: "every_ward",
      condition: "Rifampicin-resistant TB",
      trigger: {
        kind: "result",
        testCode: "test.tb_xpert",
        concept: "obs.tb_xpert",
        answers: ["mtb_detected_rif_detected"],
      },
      precaution: {
        type: "airborne",
        stopLine: "Demo: until the IPC team clears it",
        source: "Demo entry: CDC Isolation Precautions, Appendix A",
      },
      ipcAlert: true,
      confirmationNeeded: false,
      route: {
        kind: "weekly_item",
        idsrItem: "Rifampicin resistant TB cases (DR)",
        reference: "HMIS 033b row 15",
      },
      source: "Demo alert list entry",
    },
    { first: "ipc_lead", second: "lab_counter" },
  );
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const p = await newPatient(s);
    const orderId = await placeOrder(s, p, xpert.id);
    const sp = await collect(s, p, orderId);
    await receive(s, p, sp);
    await withPatientWrite(
      s.lab,
      p.id,
      (ctx) =>
        enterResults(ctx, {
          patientUserId: p.id,
          orderId,
          status: "final",
          values: [{ conceptId: "obs.tb_xpert", code: "mtb_detected_rif_detected" }],
          clientKey: key(),
        }),
      { database: s.db },
    );
    bump(s, "released");
    ids.push(p.id);
  }
  const alerts = rowsOf<{ id: string }>(
    await s.db.execute(
      sql`SELECT id FROM ipc_alerts WHERE hospital_id = ${s.h} AND patient_user_id IN (${sql.join(
        ids.map((x) => sql`${x}::uuid`),
        sql`, `,
      )}) ORDER BY created_at`,
    ),
  );
  bump(s, "ipc alerts", alerts.length);
  if (alerts[0])
    await tx(s, (t) =>
      recordIpcAction(
        t,
        { userId: s.people.ipcNurse, hospitalId: s.h },
        {
          alertId: alerts[0]!.id,
          kind: "precautions_started",
          detail: { type: "airborne", where: "Side room" },
          clientKey: key(),
        },
        new Date(),
      ),
    );
}

/** Analyser, fridge and centrifuge with logs; the centrifuge is down. */
async function equipment(s: DemoState) {
  const a = { userId: s.lab.userId, hospitalId: s.h };
  const qcConcept = s.tests[0]!.components[0]!.conceptId;
  const analyser = await tx(s, (t) =>
    saveEquipment(
      t,
      a,
      {
        kind: "analyser",
        model: "Demo chemistry analyser",
        serial: "DEMO-AN-1",
        sectionId: null,
        details: { location: "Chemistry bench" },
        linkedConcepts: [qcConcept],
        linkedTests: [],
      },
      s.now,
    ),
  );
  await tx(s, (t) =>
    saveSchedule(
      t,
      a,
      {
        deviceId: analyser,
        schedules: {
          tasks: [
            {
              key: "daily_maintenance",
              kind: "maintenance",
              every: { days: 1 },
              requiredBeforeUse: false,
            },
          ],
          temperature: null,
        },
      },
      s.now,
    ),
  );
  for (let d = 5; d >= 1; d--)
    await tx(s, (t) =>
      recordLog(
        t,
        a,
        {
          deviceId: analyser,
          kind: "maintenance",
          taskKey: "daily_maintenance",
          doneAt: new Date(s.now.getTime() - d * DAY),
          note: "Demo daily maintenance",
          filePath: null,
          clientKey: key(),
        },
        s.now,
      ),
    );
  const fridge = await tx(s, (t) =>
    saveEquipment(
      t,
      a,
      {
        kind: "fridge",
        model: "Demo reagent fridge",
        serial: "DEMO-FR-1",
        sectionId: null,
        details: { location: "Store room" },
        linkedConcepts: [],
        linkedTests: [],
      },
      s.now,
    ),
  );
  await tx(s, (t) =>
    saveSchedule(
      t,
      a,
      {
        deviceId: fridge,
        schedules: { tasks: [], temperature: { min: 2, max: 8, readingsPerDay: 2 } },
      },
      s.now,
    ),
  );
  for (const [h, v] of [
    [30, 4.8],
    [24, 5.2],
    [6, 4.6],
    [1, 5.0],
  ] as const)
    await tx(s, (t) =>
      recordTemperature(
        t,
        a,
        {
          deviceId: fridge,
          value: v,
          unit: "°C",
          doneAt: new Date(s.now.getTime() - h * 3600_000),
          clientKey: key(),
        },
        s.now,
      ),
    );
  const centrifuge = await tx(s, (t) =>
    saveEquipment(
      t,
      a,
      {
        kind: "centrifuge",
        model: "Demo centrifuge",
        serial: "DEMO-CF-1",
        sectionId: null,
        details: {},
        linkedConcepts: [],
        linkedTests: [],
      },
      s.now,
    ),
  );
  await tx(s, (t) =>
    markDown(
      t,
      a,
      {
        deviceId: centrifuge,
        since: new Date(s.now.getTime() - 5 * 3600_000),
        cause: "Demo: lid sensor fault",
        reportedTo: "Demo engineer",
        ticket: "DEMO-T-1",
      },
      async () => ({ ok: true, data: null }),
      s.now,
    ),
  );
  s.notes.__analyser = analyser;
  bump(s, "equipment", 3);
}

async function acceptancePlan(s: DemoState, itemId: string) {
  await signDemo(
    s,
    "acceptance_plan",
    itemId,
    { method: "none", triggers: [], certificateAllowed: false, source: "Demo acceptance plan" },
    { leadOnly: true },
  );
}

/** Reagents and a delivery; issued to the bench. */
async function stock(s: DemoState) {
  const a = { userId: s.lab.userId, hospitalId: s.h };
  const t = s.tests[0]!;
  const reagent = await tx(s, (x) =>
    saveItem(
      x,
      a,
      {
        name: `Demo ${t.display} reagent`,
        kind: "reagent",
        unitOfIssue: "kit",
        packSize: 1,
        testsPerUnit: 200,
        testCodes: [t.code],
        conceptIds: [],
        hmisTracerCode: null,
        storageDeviceId: null,
        minMonths: 1,
        maxMonths: 3,
      },
      s.now,
    ),
  );
  const tubes = await tx(s, (x) =>
    saveItem(
      x,
      a,
      {
        name: "Demo plain tubes",
        kind: "consumable",
        unitOfIssue: "box",
        packSize: 100,
        testsPerUnit: null,
        testCodes: [],
        conceptIds: [],
        hmisTracerCode: null,
        storageDeviceId: null,
        minMonths: 1,
        maxMonths: 4,
      },
      s.now,
    ),
  );
  await acceptancePlan(s, reagent);
  await acceptancePlan(s, tubes);
  const useBy = day(new Date(s.now.getTime() + 200 * DAY));
  await tx(s, (x) =>
    receiveDelivery(
      x,
      a,
      {
        supplier: "nms",
        supplierName: null,
        noteNumber: "DEMO-DN-1",
        receivedAt: new Date(s.now.getTime() - 10 * DAY),
        lines: [
          {
            itemId: reagent,
            lot: "DEMO-RG-01",
            useBy,
            received: 6,
            rejected: 0,
            condition: { sealed: true, coldChain: true, note: null },
          },
          {
            itemId: tubes,
            lot: "DEMO-TB-01",
            useBy,
            received: 20,
            rejected: 0,
            condition: { sealed: true, coldChain: null, note: null },
          },
        ],
        clientKey: key(),
      },
      s.now,
    ),
  );
  const lots = rowsOf<{ id: string; item: string }>(
    await s.db.execute(
      sql`SELECT id, item_id AS item FROM lab_stock_lots WHERE hospital_id = ${s.h} AND lot IN ('DEMO-RG-01','DEMO-TB-01')`,
    ),
  );
  for (const l of lots)
    await tx(s, (x) =>
      issueStock(
        x,
        a,
        {
          itemId: l.item,
          lotId: l.id,
          quantity: 2,
          toKind: "bench",
          toRef: null,
          fefoReason: null,
          clientKey: key(),
        },
        s.now,
      ),
    );
  bump(s, "stock items", 2);
}

/** An EQA scheme with a scored round. */
async function eqa(s: DemoState) {
  const a = { userId: s.lab.userId, hospitalId: s.h };
  const t = s.tests[0]!;
  const c = t.components[0]!;
  const b = bandFor(c, "female")!;
  const schemeId = await tx(s, (x) =>
    saveScheme(x, a, {
      id: null,
      name: "Demo chemistry EQA",
      provider: "Demo EQA provider",
      covers: [t.code],
      roundsPerYear: 3,
      active: true,
    }),
  );
  const roundId = await tx(s, (x) =>
    recordRound(x, a, {
      schemeId,
      label: "Demo round 2026-3",
      receivedOn: day(new Date(s.now.getTime() - 20 * DAY)),
      dueOn: day(new Date(s.now.getTime() - 10 * DAY)),
      samples: [
        { sampleId: "DEMO-S1", conceptId: c.conceptId, kit: null },
        { sampleId: "DEMO-S2", conceptId: c.conceptId, kit: null },
      ],
    }),
  );
  const v1 = ((b.low + b.high) / 2).toFixed(c.decimals ?? 1);
  const v2 = (b.high * 1.3).toFixed(c.decimals ?? 1);
  await tx(s, (x) =>
    recordEqaResults(x, a, {
      roundId,
      results: [
        { sampleId: "DEMO-S1", ours: v1 },
        { sampleId: "DEMO-S2", ours: v2 },
      ],
      testedBy: [s.lab.userId],
      submittedOn: day(new Date(s.now.getTime() - 12 * DAY)),
    }),
  );
  await tx(s, (x) =>
    recordEqaScores(
      x,
      a,
      {
        roundId,
        scoredOn: day(new Date(s.now.getTime() - 2 * DAY)),
        reportPath: null,
        scores: [
          {
            sampleId: "DEMO-S1",
            target: v1,
            score: "acceptable",
            scoreKind: "sdi",
            scoreValue: 0.4,
            limit: "±2 SDI",
            bias: null,
          },
          {
            sampleId: "DEMO-S2",
            target: v2,
            score: "acceptable",
            scoreKind: "sdi",
            scoreValue: -0.7,
            limit: "±2 SDI",
            bias: null,
          },
        ],
      },
      s.now,
    ),
  );
  bump(s, "eqa rounds");
}

/** A glucometer with a strip lot, signed device rules, a passing daily check and the nurse's competency. */
async function bedside(s: DemoState) {
  const a = { userId: s.lab.userId, hospitalId: s.h };
  const cap = await testByCode(s, "test.capillary_glucose");
  if (!cap) throw new Error("no capillary glucose test in the catalogue");
  const deviceId = await tx(s, (x) =>
    registerDevice(x, a, {
      kind: "glucometer",
      model: "Demo glucometer",
      serial: "DEMO-GM-1",
      testCode: "test.capillary_glucose",
      wardId: null,
    }),
  );
  await tx(s, (x) =>
    setDeviceState(
      x,
      a,
      { deviceId, state: "in_use", note: "Demo: verified against the lab" },
      s.now,
    ),
  );
  let lotId: string;
  if (labStockLiveFor(s.h)) {
    const strip = await tx(s, (x) =>
      saveItem(
        x,
        a,
        {
          name: "Demo glucose strips",
          kind: "strip",
          unitOfIssue: "box",
          packSize: 50,
          testsPerUnit: 50,
          testCodes: ["test.capillary_glucose"],
          conceptIds: [],
          hmisTracerCode: null,
          storageDeviceId: null,
          minMonths: 1,
          maxMonths: 3,
        },
        s.now,
      ),
    );
    await acceptancePlan(s, strip);
    await tx(s, (x) =>
      receiveDelivery(
        x,
        a,
        {
          supplier: "jms",
          supplierName: null,
          noteNumber: "DEMO-DN-2",
          receivedAt: new Date(s.now.getTime() - 5 * DAY),
          lines: [
            {
              itemId: strip,
              lot: "DEMO-ST-01",
              useBy: day(new Date(s.now.getTime() + 120 * DAY)),
              received: 4,
              rejected: 0,
              condition: { sealed: true, coldChain: null, note: null },
            },
          ],
          clientKey: key(),
        },
        s.now,
      ),
    );
    lotId = rowsOf<{ id: string }>(
      await s.db.execute(
        sql`SELECT id FROM lab_stock_lots WHERE hospital_id = ${s.h} AND lot = 'DEMO-ST-01'`,
      ),
    )[0]!.id;
    await tx(s, (x) =>
      setLotInUse(
        x,
        a,
        { lotId, deviceId, sectionId: null, conceptId: null, kind: "strip" },
        s.now,
      ),
    );
  } else {
    lotId = await tx(s, (x) =>
      addLot(x, a, {
        deviceId,
        lot: "DEMO-ST-01",
        useBy: day(new Date(s.now.getTime() + 120 * DAY)),
      }),
    );
  }
  await tx(s, (x) => setOperator(x, a, { userId: s.people.nurse, granted: true }, s.now));
  await signDemo(
    s,
    "device_qc_rule",
    "test.capillary_glucose",
    {
      triggers: ["each_day_of_use", "new_strip_lot"],
      levels: ["Demo level 1", "Demo level 2"],
      requiredBeforeUse: true,
      source: "Demo device rule",
    },
    { leadOnly: true },
  );
  await signDemo(
    s,
    "competency_validity",
    "test.capillary_glucose",
    {
      methods: ["training", "observed_test", "known_value_sample"],
      validDays: 365,
      graceDays: 30,
      source: "Demo competency rule",
    },
    { leadOnly: true },
  );
  await tx(s, (x) =>
    setStripLotRanges(x, a, {
      lotId,
      ranges: { "Demo level 1": { low: 2.5, high: 4.5 }, "Demo level 2": { low: 13, high: 19 } },
    }),
  );
  await tx(s, (x) =>
    recordCompetency(
      x,
      a,
      {
        userId: s.people.nurse,
        testCode: "test.capillary_glucose",
        assessedOn: day(new Date(s.now.getTime() - 30 * DAY)),
        method: ["training", "observed_test"],
      },
      s.now,
    ),
  );
  await tx(s, (x) =>
    recordDeviceCheck(
      x,
      { userId: s.people.nurse, hospitalId: s.h },
      {
        deviceId,
        stripLotId: lotId,
        trigger: "each_day_of_use",
        observed: { "Demo level 1": 3.4, "Demo level 2": 15.8 },
        clientKey: key(),
      },
      s.now,
    ),
  );
  bump(s, "bedside devices");
}

/** Yesterday's network outage and a few reserved paper forms. */
async function downtime(s: DemoState) {
  const y = new Date(s.now.getTime() - DAY);
  y.setUTCHours(7, 0, 0, 0);
  await tx(s, (x) =>
    recordPeriod(
      x,
      s.lab,
      {
        startsAt: y,
        endsAt: new Date(y.getTime() + 2 * 3600_000),
        reason: "network",
        note: "Demo: network outage",
      },
      s.now,
    ),
  );
  await tx(s, (x) => reserveFormNumbers(x, s.lab, 5, s.now));
  bump(s, "downtime periods");
}

/**
 * Twenty days of QC on the demo analyser for the first component, with a 1-2s warning and today's run rejected, so
 * Quality today, the chart, the hold and a nonconformity all show. Targets are derived from the signed range and
 * labelled demo.
 */
async function qc(s: DemoState) {
  const analyser = s.notes.__analyser;
  delete s.notes.__analyser;
  if (!analyser) throw new Error("no demo analyser (the equipment section did not run)");
  const a = { userId: s.lab.userId, hospitalId: s.h };
  const t = s.tests[0]!;
  const c = t.components[0]!;
  const b = bandFor(c, "female")!;
  const dp = Math.max(0, (c.decimals ?? 1) + 1);
  const m1 = (b.low + b.high) / 2;
  const m2 = b.high + (b.high - b.low) / 2;
  const sd = (b.high - b.low) / 8;
  const control = await tx(s, (x) =>
    saveItem(
      x,
      a,
      {
        name: `Demo ${t.display} control`,
        kind: "control",
        unitOfIssue: "vial",
        packSize: 1,
        testsPerUnit: null,
        testCodes: [],
        conceptIds: [c.conceptId],
        hmisTracerCode: null,
        storageDeviceId: null,
        minMonths: null,
        maxMonths: null,
      },
      s.now,
    ),
  );
  const [l1, l2] = await tx(s, (x) =>
    grandfatherLots(
      x,
      a,
      {
        statement: "Demo: both control lots were on the shelf and in use.",
        lots: [
          { itemId: control, lot: "DEMO-CTL-1", useBy: "2099-12-31", quantity: 5 },
          { itemId: control, lot: "DEMO-CTL-2", useBy: "2099-12-31", quantity: 5 },
        ],
        clientKey: key(),
      },
      s.now,
    ),
  );
  await signDemo(s, "qc_plan", `${analyser}:${c.conceptId}`, {
    unit: c.unit,
    levels: [
      { level: 1, label: "Level 1 · demo normal", controlItemId: control },
      { level: 2, label: "Level 2 · demo high", controlItemId: control },
    ],
    frequency: { kind: "each_day_before_patients" },
    rejectRules: ["1-3s", "2-2s", "R-4s", "4-1s", "10-x"],
    warnRules: ["1-2s"],
    tenXAcrossLevels: false,
    holdWhenNotRun: false,
    targets: [
      {
        level: 1,
        controlLotId: l1,
        mean: Number(m1.toFixed(dp)),
        sd: Number(sd.toFixed(dp + 1)),
        source: "lab",
      },
      {
        level: 2,
        controlLotId: l2,
        mean: Number(m2.toFixed(dp)),
        sd: Number(sd.toFixed(dp + 1)),
        source: "lab",
      },
    ],
    source: "Demo QC plan: targets derived from the signed range for illustration",
  });
  // z-scores per day for level 1 and level 2; alternating sides keep the run rules quiet until the warning and the reject.
  const z1 = [
    0.3, -0.6, 0.9, -0.2, 0.5, -1.1, 0.4, -0.3, 0.8, -0.7, 0.2, -0.4, 1.0, -0.5, 0.6, -0.9, 2.3,
    -0.2, 0.4, 3.4,
  ];
  const z2 = [
    -0.2, 0.4, -0.5, 0.7, -0.3, 0.6, -0.8, 0.2, -0.4, 0.5, -0.6, 0.3, -0.2, 0.8, -0.5, 0.4, -0.3,
    0.6, -0.1, 0.2,
  ];
  for (let i = 0; i < z1.length; i++) {
    const daysAgo = z1.length - 1 - i;
    const runAt = new Date(s.now.getTime() - daysAgo * DAY - 3600_000);
    const values = [
      { level: 1, lotId: l1!, value: Number((m1 + z1[i]! * sd).toFixed(dp)) },
      { level: 2, lotId: l2!, value: Number((m2 + z2[i]! * sd).toFixed(dp)) },
    ];
    let done = false;
    for (const expect of ["accepted", "warning", "rejected"] as const) {
      try {
        await tx(s, (x) =>
          recordQcRun(
            x,
            a,
            {
              deviceId: analyser,
              conceptId: c.conceptId,
              values,
              expect,
              firstStep: expect === "rejected" ? "Demo: recalibrate, then rerun controls" : null,
              note: null,
              runAt,
              clientKey: key(),
            } as never,
            s.now,
          ),
        );
        done = true;
        break;
      } catch (e) {
        if (!(e instanceof Error) || !/different/i.test(e.message)) throw e;
      }
    }
    if (done) bump(s, "qc runs");
  }
}

export const DEMO_SECTIONS: { before: Section[]; after: Section[] } = {
  before: [
    ["catalogue", catalogue],
    ["ranges", ranges],
    ["critical set-up", criticalSetup],
  ],
  after: [
    ["rejected", rejected],
    ["criticals", criticals],
    ["delta checks", delta],
    ["patient results", patientRelease],
    ["referrals", referral],
    ["infection prevention", ipc],
    ["equipment", equipment],
    ["stock", stock],
    ["eqa", eqa],
    ["bedside", bedside],
    ["downtime", downtime],
    ["qc", qc],
  ],
};
