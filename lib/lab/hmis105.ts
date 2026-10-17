/**
 * HMIS 105, laboratory: the form version, the mapping, the monthly count and the report lifecycle (Lab Phase 3
 * §6.11, HM-1..HM-13; GATE A P10, P11, P16, P17, §3.1 `hmis_mapping`, §8). Pure.
 *
 * The form is a committed data file (`data/lab/hmis105-2019-09.json`, every row unverified until OA-1). The
 * mapping is signed data (the lead and the HMIS focal person); nothing here maps a test to a row by itself.
 * `count105` is pure over a snapshot of source rows the caller reads; counting rules HM-3 (a)–(i) are marked
 * where they apply. A cell key is `{row}|{column}`, the row being its code (or its label where the transcription
 * has no code: 10.3 kits, some 10.7 reasons) and, in 10.5, the test code.
 */
import type { EqaRound } from "@/lib/lab/eqa";
import type { StockItem, StockTx } from "@/lib/lab/stock";

import {
  addDays,
  consumed,
  dayOf,
  daysOfMonth,
  daysOutOfStock,
  endOfDay,
  onHand,
} from "@/lib/lab/stock";

// ─── HM-1: the form version ─────────────────────────────────────────────────

export interface HmisForm {
  version: string;
  verified: boolean;
  sections: { id: string; title: string; columns: string[] }[];
  rows: {
    code: string | null;
    label: string;
    section: string;
    group: string | null;
    hasPositive: boolean | null;
    sub?: string[];
    cells: { column: string; dataElement: string | null; categoryOption: string | null }[];
    verified: boolean;
  }[];
}

export const rowKey = (row: { code: string | null; label: string }) => row.code ?? row.label;
export const cellKey = (row: string, column: string) => `${row}|${column}`;

export const DONE = "Number Done";
export const POSITIVE = "Number Positive";

// ─── HM-2: the mapping ──────────────────────────────────────────────────────

/** A source of a 10.2 row: a test (one per report) or one component of it (per analyte, HM-3 b). */
export interface HmisSource {
  testCode: string;
  conceptId?: string;
  /** Only reports whose coded answer for `conceptId` is one of `answers` (e.g. the AFB stain method). */
  where?: { conceptId: string; answers: string[] };
}

/** The `hmis_mapping` payload, as far as the engine reads it. Every key is the lead's and the focal person's. */
export interface HmisMapping {
  rows: {
    code: string;
    sources: HmisSource[];
    /** Per positive column (`Number Positive`, or a sub-column such as ML01's MTB+ and RR). */
    positive?: { column: string; conceptId: string; answers: string[] }[];
  }[];
  /** HM-4: encounter type → LV01 or LV02. */
  visits: Record<string, string>;
  /** Specimen type → 10.1 / 10.7 column. */
  specimenColumns: Record<string, string>;
  /** MedSync rejection code → 10.7 row. */
  rejection: Record<string, string>;
  /** Hub availability reason → 10.5 column (P17; `none` for orders placed before the reason was recorded). */
  reasons: Record<string, string>;
  /** HM-5: tests counted in 10.3, the algorithm's kit names → 10.3 rows, stock items → 10.3 rows (IQC). */
  hivTests: string[];
  kits: Record<string, string>;
  kitItems: Record<string, string>;
  /** `encounter_orders.test_purpose` → 10.3 column. */
  purposes: Record<string, string>;
  /** HM-9: stock item id → Section 6 row. */
  tracers: Record<string, string>;
  /** Orderable tests the lead explicitly does not report. */
  excluded: string[];
}

/**
 * HM-2, S40: what stops the mapping being signed: rows or columns not on the form, orderable in-house tests
 * neither mapped nor excluded, and a form not yet verified against eHMIS (OA-1).
 */
export function mappingSignErrors(
  mapping: HmisMapping,
  form: HmisForm,
  menu: readonly string[],
): string[] {
  const e: string[] = [];
  if (!form.verified) e.push("form_not_verified");
  const keys = new Set(form.rows.flatMap((r) => r.cells.map((c) => cellKey(rowKey(r), c.column))));
  const rowOk = (row: string, column: string) => keys.has(cellKey(row, column));
  for (const r of mapping.rows) {
    if (!rowOk(r.code, DONE)) e.push(`unknown_row:${r.code}`);
    for (const p of r.positive ?? [])
      if (!rowOk(r.code, p.column)) e.push(`unknown_cell:${cellKey(r.code, p.column)}`);
  }
  for (const t of unmappedTests(mapping, menu)) e.push(`unmapped_test:${t}`);
  return e;
}

/** HM-2: orderable in-house tests in no row, not in 10.3 and not excluded (listed on the report). */
export function unmappedTests(mapping: HmisMapping, menu: readonly string[]): string[] {
  const mapped = new Set([
    ...mapping.rows.flatMap((r) => r.sources.map((s) => s.testCode)),
    ...mapping.hivTests,
    ...mapping.excluded,
  ]);
  return menu.filter((t) => !mapped.has(t));
}

// ─── HM-3..HM-9: the count ──────────────────────────────────────────────────

/** One version of a lab report (`diagnostic_reports`), with what the count reads. */
export interface HmisReport {
  id: string;
  logicalId: string;
  version: number;
  hospitalId: string;
  testCode: string;
  status: "preliminary" | "final" | "amended" | "corrected" | "entered_in_error" | "cancelled";
  performer: "in_house" | "external";
  /** Done at the bedside in this hospital (a device on the report). */
  bedside: boolean;
  resultAt: Date;
  /** Downtime back-entry: the form's result time (HM-3 a). */
  formResultAt: Date | null;
  observations: { conceptId: string; code: string | null }[];
  /** 10.3: the signed algorithm version's assays, its outcome, and the order's purpose. */
  hiv?: { assays: { step: number; kit: string }[]; outcome: string | null; purpose: string | null };
}

export interface HmisSpecimen {
  id: string;
  hospitalId: string;
  patientId: string;
  specimenType: string;
  encounterType: string;
  receivedAt: Date | null;
  /** SC01 collected here; otherwise received from elsewhere (SC02). */
  collectedHere: boolean;
  rejected: { at: Date; reasonCode: string } | null;
}

export interface HmisReferral {
  orderId: string;
  hospitalId: string;
  testCode: string;
  placedAt: Date;
  /** The hub reason from the availability snapshot; null when the order predates it. */
  reason: string | null;
}

export interface Cell {
  /** null = blank (HM-3 i): not on the menu, or nothing maps there. */
  value: number | null;
  /** Record ids behind the count (HM-11). */
  sources: string[];
  /** HM-3 h: how many of `value` were bedside tests. */
  bedside?: number;
  manual?: true;
}

export interface Count105Input {
  hospitalId: string;
  /** "2026-09". */
  month: string;
  timeZone: string;
  mapping: HmisMapping;
  /** In-house test codes on the hospital's menu (hub provision `in_house`). */
  menu: readonly string[];
  reports: readonly HmisReport[];
  specimens: readonly HmisSpecimen[];
  referrals: readonly HmisReferral[];
  controlChecks: readonly { hospitalId: string; itemId: string; at: Date; hmisIqc: boolean }[];
  eqaRounds: readonly EqaRound[];
  stockItems: readonly StockItem[];
  stockTxs: readonly StockTx[];
  /** Hand-entered cells (10.3 repeat testers and DNA confirmed, 10.4, 10.5 confirmatory and QA, 10.6). */
  manual: Readonly<Record<string, number>>;
}

export interface Count105 {
  month: string;
  cells: Record<string, Cell>;
  /** Unmapped tests, specimen types, rejection codes, kits and purposes met this month (listed on the report). */
  unmapped: string[];
  /** 10.3 patient tests whose order has no purpose ("Purpose not recorded", never guessed). */
  purposeNotRecorded: number;
  /** Manual values for cells the count computes (ignored; the computed value stands). */
  manualIgnored: string[];
}

const RELEASED = new Set(["final", "amended", "corrected"]);
const HIV_STEP = /^obs\.hiv_rdt_t(\d+)$/;
const INCONCLUSIVE = new Set(["inconclusive", "inconclusive_refer"]);

/** HM-3: the monthly count, rules (a)–(i), for one hospital. */
export function count105(input: Count105Input): Count105 {
  const { mapping: m, month, timeZone: tz, hospitalId } = input;
  const inMonth = (at: Date) => dayOf(at, tz).startsWith(month);
  const menu = new Set(input.menu);
  const cells: Record<string, Cell> = {};
  const unmapped = new Set<string>();
  const add = (key: string, source: string, bedside = false) => {
    const c = (cells[key] ??= { value: 0, sources: [] });
    c.value = (c.value ?? 0) + 1;
    c.sources.push(source);
    if (bedside) c.bedside = (c.bedside ?? 0) + 1;
  };

  // (a), (f), (g): one current version per released result, in house, by the first release's time.
  const byLogical = new Map<string, HmisReport[]>();
  for (const r of input.reports)
    if (r.hospitalId === hospitalId)
      byLogical.set(r.logicalId, [...(byLogical.get(r.logicalId) ?? []), r]);
  const results: HmisReport[] = [];
  for (const versions of byLogical.values()) {
    versions.sort((a, b) => a.version - b.version);
    const current = versions.at(-1)!;
    const first = versions.find((v) => RELEASED.has(v.status));
    if (!first || !RELEASED.has(current.status)) continue;
    if (current.performer !== "in_house") continue; // (f) outside results never count
    if (inMonth(first.formResultAt ?? first.resultAt)) results.push(current);
  }

  // 10.2, (b) per analyte, (h) bedside share, (i) blank versus zero. QC runs and EQA samples are not reports (c);
  // a rejected specimen has no released report (d); a referred test has no in-house report (e).
  for (const row of m.rows) {
    const onMenu = row.sources.some((s) => menu.has(s.testCode));
    const columns = [DONE, ...(row.positive ?? []).map((p) => p.column)];
    for (const col of columns)
      cells[cellKey(row.code, col)] = { value: onMenu ? 0 : null, sources: [] };
    if (!onMenu) continue;
    const answered = (r: HmisReport, conceptId: string, answers: readonly string[]) =>
      r.observations.some((o) => o.conceptId === conceptId && answers.includes(o.code ?? ""));
    const matches = (r: HmisReport, s: HmisSource) =>
      s.testCode === r.testCode &&
      (!s.conceptId || r.observations.some((o) => o.conceptId === s.conceptId)) &&
      (!s.where || answered(r, s.where.conceptId, s.where.answers));
    for (const r of results) {
      for (const s of row.sources)
        if (matches(r, s))
          add(
            cellKey(row.code, DONE),
            s.conceptId ? `${r.logicalId}:${s.conceptId}` : r.logicalId,
            r.bedside,
          );
      if (!row.sources.some((s) => matches(r, s))) continue;
      for (const p of row.positive ?? [])
        if (answered(r, p.conceptId, p.answers))
          add(cellKey(row.code, p.column), r.logicalId, r.bedside);
    }
  }

  // 10.1 (HM-4): patient × hospital-local day × OPD/IPD with a specimen received, by specimen column; SC01/SC02.
  const visits = new Set<string>();
  for (const s of input.specimens) {
    if (s.hospitalId !== hospitalId || !s.receivedAt || !inMonth(s.receivedAt)) continue;
    const column = m.specimenColumns[s.specimenType];
    if (!column) {
      unmapped.add(`specimen_type:${s.specimenType}`);
      continue;
    }
    add(cellKey(s.collectedHere ? "SC01" : "SC02", column), s.id);
    const visit = m.visits[s.encounterType];
    if (!visit) unmapped.add(`encounter_type:${s.encounterType}`);
    const key = visit && `${s.patientId}|${dayOf(s.receivedAt, tz)}|${visit}|${column}`;
    if (key && !visits.has(key)) {
      visits.add(key);
      add(cellKey(visit, column), s.id);
    }
  }

  // 10.7 (d): rejected specimens by reason × specimen column, by the day they were rejected.
  for (const s of input.specimens) {
    if (s.hospitalId !== hospitalId || !s.rejected || !inMonth(s.rejected.at)) continue;
    const row = m.rejection[s.rejected.reasonCode];
    const column = m.specimenColumns[s.specimenType];
    if (!row) unmapped.add(`rejection:${s.rejected.reasonCode}`);
    if (row && column) add(cellKey(row, column), s.id);
  }

  // 10.3 (HM-5, KQ-6, EA-6): HIV kit tests by kit × purpose; IQC; EQA; total; inconclusive.
  let purposeNotRecorded = 0;
  if (m.hivTests.some((t) => menu.has(t))) {
    const columns = [...Object.values(m.purposes), "IQC", "EQA", "Total", "Inconclusive Results"];
    for (const row of new Set([...Object.values(m.kits), ...Object.values(m.kitItems)]))
      for (const col of columns) cells[cellKey(row, col)] = { value: 0, sources: [] };
    for (const r of results) {
      if (!m.hivTests.includes(r.testCode) || !r.hiv) continue;
      let lastRow: string | undefined;
      for (const o of r.observations) {
        const step = HIV_STEP.exec(o.conceptId)?.[1];
        const kit = step && r.hiv.assays.find((a) => a.step === Number(step))?.kit;
        if (!kit) continue;
        const row = m.kits[kit];
        if (!row) {
          unmapped.add(`kit:${kit}`);
          continue;
        }
        lastRow = row;
        add(cellKey(row, "Total"), `${r.logicalId}:${o.conceptId}`);
        const purpose = r.hiv.purpose && m.purposes[r.hiv.purpose];
        if (purpose) add(cellKey(row, purpose), `${r.logicalId}:${o.conceptId}`);
        else if (r.hiv.purpose) unmapped.add(`purpose:${r.hiv.purpose}`);
        else purposeNotRecorded++;
      }
      // An inconclusive outcome counts once, on the kit of the last step performed.
      if (lastRow && INCONCLUSIVE.has(r.hiv.outcome ?? ""))
        add(cellKey(lastRow, "Inconclusive Results"), r.logicalId);
    }
    for (const c of input.controlChecks) {
      const row = m.kitItems[c.itemId];
      if (c.hospitalId === hospitalId && c.hmisIqc && row && inMonth(c.at))
        add(cellKey(row, "IQC"), `check:${c.itemId}:${c.at.toISOString()}`);
    }
    for (const round of input.eqaRounds) {
      if (round.hospitalId !== hospitalId || !round.submittedOn?.startsWith(month)) continue;
      for (const s of round.samples) {
        const row = s.kit && m.kits[s.kit];
        if (row) add(cellKey(row, "EQA"), `${round.id}:${s.sampleId}`);
      }
    }
  }

  // 10.5 (HM-7, e): tests not done here, by the hub's reason at placement.
  for (const o of input.referrals) {
    if (o.hospitalId !== hospitalId || !inMonth(o.placedAt)) continue;
    const column = m.reasons[o.reason ?? "none"];
    if (!column) unmapped.add(`reason:${o.reason ?? "none"}`);
    else add(cellKey(o.testCode, column), o.orderId);
  }

  // Section 6 (HM-9): tracer stock from the ledger.
  const days = daysOfMonth(month);
  const from = endOfDay(addDays(days[0]!, -1), tz);
  const to = endOfDay(days.at(-1)!, tz);
  for (const item of input.stockItems) {
    const row = m.tracers[item.id];
    if (!row || item.hospitalId !== hospitalId) continue;
    const q = { hospitalId, itemId: item.id };
    const set = (column: string, value: number) =>
      (cells[cellKey(row, column)] = { value, sources: [item.id] });
    set("Quantity consumed", consumed(input.stockTxs, { ...q, from, to }));
    set(
      "Days out of stock",
      daysOutOfStock(input.stockTxs, { ...q, fromDay: days[0]!, toDay: days.at(-1)!, timeZone: tz })
        .length,
    );
    set("Stock on hand", onHand(input.stockTxs, { ...q, at: to }));
    set(
      "Quantity expired",
      0 -
        input.stockTxs
          .filter(
            (t) =>
              t.hospitalId === hospitalId &&
              t.itemId === item.id &&
              t.kind === "write_off" &&
              t.reason === "expired" &&
              t.at >= from &&
              t.at < to,
          )
          .reduce((s, t) => s + t.quantity, 0),
    );
  }

  // Manual cells fill only what the count does not compute.
  const manualIgnored: string[] = [];
  for (const [key, value] of Object.entries(input.manual)) {
    if (cells[key]) manualIgnored.push(key);
    else cells[key] = { value, sources: [], manual: true };
  }

  for (const t of unmappedTests(m, input.menu)) unmapped.add(`test:${t}`);
  return { month, cells, unmapped: [...unmapped].sort(), purposeNotRecorded, manualIgnored };
}

// ─── HM-10..HM-13: lifecycle, revision, export, reminder ───────────────────

export type HmisState = "draft" | "checked" | "signed" | "exported";

/**
 * HM-10: draft → checked (the laboratory lead) → signed (the Health Unit In-Charge, fresh second factor) →
 * exported. Signing freezes the cells, their sources and the mapping version (the caller stores the count).
 */
export function hmisTransition(
  from: HmisState,
  to: HmisState,
  actor: { isLead: boolean; isInCharge: boolean; freshSecondFactor: boolean },
): string | null {
  if (from === "draft" && to === "checked") return actor.isLead ? null : "not_lead";
  if (from === "checked" && to === "signed") {
    if (!actor.isInCharge) return "not_in_charge";
    return actor.freshSecondFactor ? null : "second_factor_not_fresh";
  }
  if (from === "signed" && to === "exported") return null;
  return "not_allowed";
}

export interface CellChange {
  key: string;
  old: number | null;
  new: number | null;
  added: string[];
  removed: string[];
}

/** HM-11: "Changed since signing": every cell whose value differs, with the records that caused it. */
export function revisionDiff(
  signed: Readonly<Record<string, Cell>>,
  fresh: Readonly<Record<string, Cell>>,
): CellChange[] {
  const keys = [...new Set([...Object.keys(signed), ...Object.keys(fresh)])].sort();
  return keys.flatMap((key) => {
    const a = signed[key];
    const b = fresh[key];
    const old = a?.value ?? null;
    const now = b?.value ?? null;
    if (old === now) return [];
    const before = new Set(a?.sources ?? []);
    const after = new Set(b?.sources ?? []);
    return [
      {
        key,
        old,
        new: now,
        added: [...after].filter((s) => !before.has(s)),
        removed: [...before].filter((s) => !after.has(s)),
      },
    ];
  });
}

/**
 * HM-12: the CSV in the form's data-element order: data element, category option, value, period, organisation
 * unit. Blank cells are absent and zeros present (HM-3 i). Cells with a value but no eHMIS id yet are listed.
 */
export function toCsv(
  form: HmisForm,
  cells: Readonly<Record<string, Cell>>,
  q: { month: string; orgUnit: string },
): { csv: string; missingIds: string[] } {
  const period = q.month.replace("-", "");
  const lines = ["dataElement,categoryOption,value,period,orgUnit"];
  const missingIds: string[] = [];
  for (const row of form.rows)
    for (const c of row.cells) {
      const key = cellKey(rowKey(row), c.column);
      const value = cells[key]?.value;
      if (value === null || value === undefined) continue;
      if (!c.dataElement) missingIds.push(key);
      else lines.push([c.dataElement, c.categoryOption ?? "", value, period, q.orgUnit].join(","));
    }
  return { csv: `${lines.join("\n")}\n`, missingIds };
}

/** HM-13: from the 1st to the 7th (hospital-local), the previous month while its report is unsigned. */
export function hmisReminder(
  now: Date,
  timeZone: string,
  signedMonths: readonly string[],
): string | null {
  const today = dayOf(now, timeZone);
  if (Number(today.slice(8, 10)) > 7) return null;
  const previous = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  return signedMonths.includes(previous) ? null : previous;
}

// ─── HM-14..HM-17: section 10.4 from referral records (Lab Phase 4 §6.9) ───────────────

export const REFERRED = "No. of Specimen Referred";
export const AVERAGE_TAT = "Average Turn Around Time (Days)";
export const PENDING = "No. of Pending Results/Feedback";

export interface HmisReferralRecord {
  referralId: string;
  hospitalId: string;
  testCodes: readonly string[];
  routine: boolean;
  state: string;
  /** Handed over (RF-5); null while still packed. */
  sentAt: Date | null;
  completedAt: Date | null;
  /** The last state change; for "terminal by the end of the month". */
  stateAt: Date | null;
}

const TERMINAL = new Set(["completed", "failed", "lost", "cancelled", "rejected"]);

/**
 * HM-14: per 10.4 row of the signed mapping (its `sources` name the tests): number referred = referrals handed
 * over in the month for those tests; average turnaround = the mean of (result back − handed over), in days, for
 * referrals completed in the month; pending = handed over and not terminal at the end of the month. HM-17:
 * outbreak and cancelled referrals are left out; a rejected referral counts once as referred. Every cell carries
 * the referral ids behind it (HM-11). The turnaround definition is the Division of Health Information's to
 * confirm (HM-15): the form's column says days, and this counts elapsed days to two decimals.
 */
export function referralCells104(o: {
  hospitalId: string;
  month: string;
  timeZone: string;
  mapping: HmisMapping;
  /** The 10.4 row codes on the form. */
  rows: readonly string[];
  referrals: readonly HmisReferralRecord[];
}): Record<string, Cell> {
  const inMonth = (at: Date | null) => !!at && dayOf(at, o.timeZone).startsWith(o.month);
  const [y, m] = o.month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const monthEnd = endOfDay(lastDay, o.timeZone);
  const cells: Record<string, Cell> = {};
  for (const code of o.rows) {
    const tests = new Set(
      (o.mapping.rows.find((r) => r.code === code)?.sources ?? []).map((s) => s.testCode),
    );
    const mine = o.referrals.filter(
      (r) =>
        r.hospitalId === o.hospitalId &&
        r.routine &&
        r.state !== "cancelled" &&
        r.testCodes.some((t) => tests.has(t)),
    );
    const sent = mine.filter((r) => inMonth(r.sentAt));
    const done = mine.filter((r) => r.state === "completed" && r.sentAt && inMonth(r.completedAt));
    const pending = mine.filter(
      (r) =>
        r.sentAt &&
        r.sentAt < monthEnd &&
        !(TERMINAL.has(r.state) && r.stateAt && r.stateAt < monthEnd),
    );
    const days = done.map((r) => (r.completedAt!.getTime() - r.sentAt!.getTime()) / 86_400_000);
    cells[cellKey(code, REFERRED)] = { value: sent.length, sources: sent.map((r) => r.referralId) };
    cells[cellKey(code, AVERAGE_TAT)] = {
      value: days.length
        ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 100) / 100
        : null,
      sources: done.map((r) => r.referralId),
    };
    cells[cellKey(code, PENDING)] = {
      value: pending.length,
      sources: pending.map((r) => r.referralId),
    };
  }
  return cells;
}

/**
 * HM-16: records replace the hand-entered 10.4 cells only from the first month the laboratory lead declares
 * referral tracking complete (signed `referral_ops.hmis104RecordsFrom`, "YYYY-MM"): the repo keeps no history of
 * when a flag was switched on, so the lead says it rather than MedSync guessing.
 */
export function recordsCover104(month: string, recordsFrom: string | null | undefined): boolean {
  return !!recordsFrom && month >= recordsFrom;
}
