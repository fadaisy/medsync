/**
 * Monthly reports (rework PRD §6.6, prototype productivity.js `issues`, `medRows`, `cdRows`, `ReportDialog`): the
 * figures' issue checks and the Draft → Checked → Submitted rules. Pure.
 */
import type { ReportKind } from "@/db/schema/pharmacy-rework-records";
import type { SourceRow } from "@/lib/pharmacy/audit/derive";

export const REPORT_KINDS: readonly ReportKind[] = ["hmis_meds", "hmis_epi", "cd_return", "losses"];

/** One medicine's month from the ledger. */
export interface MedRow {
  productId: string;
  name: string;
  unit: string;
  controlled: boolean;
  opening: number;
  received: number;
  consumed: number;
  lost: number;
  closing: number;
  amc: number;
  daysOut: number;
  /** Controlled lines out this month with a paper witness or none. */
  noWitness: number;
}

export interface OpenCase {
  id: string;
  productId: string | null;
  product: string | null;
  controlled: boolean;
  /** Negative: short. Null when the case names no quantity. */
  qty: number | null;
  unitPrice: number;
}

export interface EpiRow {
  antigen: string;
  given: number;
}
export interface EpiWasteRow {
  vaccine: string;
  given: number;
  wasted: number;
}

export interface LossRow {
  cause: string;
  lines: number;
  value: number;
}

export interface ReportFigures {
  meds: MedRow[];
  cases: OpenCase[];
  epi: { inUse: boolean; antigens: EpiRow[]; waste: EpiWasteRow[] };
  losses: LossRow[];
}

export type Sev = "stop" | "warn" | "info";
/** `key` marks a remark item: it needs a reason chip before the report can be checked. */
export interface Issue {
  sev: Sev;
  key: string | null;
  /** A word key with its values, turned into words by the page. */
  what:
    | { k: "outOfStock"; med: string; days: number }
    | { k: "openCase"; med: string; n: number }
    | { k: "noWitness"; n: number }
    | { k: "epiWaste"; vaccine: string; pct: number }
    | { k: "epiMissing" }
    | { k: "casesOpen"; n: number };
}

export const wastagePct = (w: EpiWasteRow) =>
  w.given + w.wasted > 0 ? Math.round((w.wasted / (w.given + w.wasted)) * 100) : 0;

/** The month's report body: only the figures this report prints. */
export function reportRows(kind: ReportKind, f: ReportFigures) {
  if (kind === "hmis_meds") return f.meds;
  if (kind === "cd_return") return f.meds.filter((r) => r.controlled);
  if (kind === "hmis_epi") return f.epi;
  return f.losses;
}

export function reportIssues(kind: ReportKind, f: ReportFigures, epiRemarkPct: number): Issue[] {
  const out: Issue[] = [];
  if (kind === "hmis_meds")
    for (const r of f.meds)
      if (r.daysOut > 0)
        out.push({
          sev: "warn",
          key: `rm-${r.productId}`,
          what: { k: "outOfStock", med: r.name, days: r.daysOut },
        });
  if (kind === "hmis_epi") {
    if (!f.epi.inUse) out.push({ sev: "info", key: null, what: { k: "epiMissing" } });
    for (const w of f.epi.waste)
      if (wastagePct(w) > epiRemarkPct)
        out.push({
          sev: "warn",
          key: `rm-${w.vaccine}`,
          what: { k: "epiWaste", vaccine: w.vaccine, pct: wastagePct(w) },
        });
  }
  if (kind === "cd_return") {
    const open = new Map<string, { med: string; n: number }>();
    for (const c of f.cases)
      if (c.controlled) {
        const k = c.productId ?? c.id;
        open.set(k, { med: c.product ?? "", n: (open.get(k)?.n ?? 0) + 1 });
      }
    for (const o of open.values())
      out.push({ sev: "stop", key: null, what: { k: "openCase", med: o.med, n: o.n } });
    const nw = f.meds.filter((r) => r.controlled).reduce((a, r) => a + r.noWitness, 0);
    if (nw) out.push({ sev: "warn", key: null, what: { k: "noWitness", n: nw } });
  }
  if (kind === "losses" && f.cases.length)
    out.push({ sev: "info", key: null, what: { k: "casesOpen", n: f.cases.length } });
  return out;
}

export type ReportState = "draft" | "checked" | "submitted";

/** Checking needs every remark item answered; submitting needs no stop item, a checked report and the in-charge. */
export function reportGate(
  issues: readonly Issue[],
  remarks: Readonly<Record<string, string>>,
  state: ReportState,
  inCharge: boolean,
) {
  const blocked = issues.filter((i) => i.sev === "stop").length;
  const remarksLeft = issues.filter((i) => i.key && !remarks[i.key]).length;
  return {
    blocked,
    remarksLeft,
    canCheck: state === "draft" && remarksLeft === 0,
    canSubmit: state === "checked" && blocked === 0 && inCharge,
  };
}

/** A row of another area's table with its medicine (see `extraRows`). */
export interface CaseSourceRow extends SourceRow {
  productId: string | null;
  product: string | null;
  controlled: boolean;
  unitPrice: number;
}

/**
 * Open investigations, from `pharmacy_cases` (built with Controls) read through `private.pharmacy_rows_if`: empty until
 * that table exists. A case is open until it is signed off; it is controlled when its medicine is, or when it came from a controlled-drug check.
 */
export function openCases(rows: readonly CaseSourceRow[]): OpenCase[] {
  return rows.flatMap((r) => {
    if (r.src !== "pharmacy_cases" || r.j.signed_off_at) return [];
    const q = Number(r.j.qty);
    return [
      {
        id: String(r.j.id ?? ""),
        productId: r.productId,
        product: r.product,
        controlled: r.controlled || r.j.source_type === "cd_check",
        qty: Number.isFinite(q) ? q : null,
        unitPrice: r.unitPrice,
      },
    ];
  });
}
