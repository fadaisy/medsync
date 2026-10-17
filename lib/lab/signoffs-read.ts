import "server-only";

import type { ConfigKind, SchemePayload } from "./signed-config";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { labSignedConfigs } from "@/db/schema/lab-catalogue";
import { users } from "@/db/schema/users";
import { PAYLOADS } from "./signed-config";

/**
 * Lab catalogue v2 configuration the laboratory lead has signed, waiting for the CSO (Lab Phase 2, ADR 0252;
 * D-LAB1-11 carried over). Every hospital and the global rows (REF, the addendum). Read-only: the
 * countersignature goes through signConfigAsCsoAction.
 */

export const KIND_WORDS: Record<ConfigKind, string> = {
  scheme: "Decision cut-offs",
  flag_basis: "Flag basis",
  elevation: "Elevation",
  hiv_algorithm: "HIV testing algorithm",
  ncd_mapping: "NCD field mapping",
  ref: "Reference entry",
  addendum: "Concept addendum",
  acceptance_plan: "Lot acceptance plan",
  qc_plan: "QC plan",
  qc_policy: "QC policy",
  kit_qc_rule: "Kit or stain QC rule",
  device_qc_rule: "Bedside device control rule",
  competency_validity: "Bedside competency validity",
  hmis_mapping: "HMIS 105 mapping",
  register_config: "Daily register columns",
  partner_tests: "Partner's tests and turnaround",
  partner_packing: "Packing checklist",
  partner_legal: "Partner's legal record",
  partner_fields: "Fields sent to a partner",
  referral_ops: "Referral settings (operational)",
  referral_wording: "High-risk referral wording",
  patient_release: "What patients see, and when",
  plain_words: "Plain words for patients",
  minors_rule: "Patients under 18",
  sms_template: "Results-ready SMS",
  patient_floor_additions: "Tests never shown to patients (additions)",
  results_consent_notice: "Results consent wording",
  delta_rule: "Delta check rule",
  panel_rule: "Panel delta rule",
  pattern_rule: "Pattern rule",
  ipc_alert_entry: "IPC alert list entry",
};

const author = alias(users, "author");
const lead = alias(users, "lead");

export async function loadConfigsWaitingForCso() {
  const rows = await db
    .select({
      c: labSignedConfigs,
      hospital: hospitals.name,
      author: author.fullName,
      lead: lead.fullName,
    })
    .from(labSignedConfigs)
    .leftJoin(hospitals, eq(hospitals.id, labSignedConfigs.hospitalId))
    .leftJoin(author, eq(author.id, labSignedConfigs.authoredBy))
    .leftJoin(lead, eq(lead.id, labSignedConfigs.leadSignedBy))
    // The HMIS mapping's second signature is the HMIS focal person's, never the CSO's (E-LAB3-12).
    .where(
      and(
        eq(labSignedConfigs.status, "draft"),
        isNotNull(labSignedConfigs.leadSignedBy),
        ne(labSignedConfigs.kind, "hmis_mapping"),
      ),
    )
    .orderBy(desc(labSignedConfigs.leadSignedAt))
    .limit(200);
  return rows.map(({ c, hospital, author, lead }) => {
    const kind = c.kind as ConfigKind;
    const parsed = PAYLOADS[kind]?.safeParse(c.payload);
    const payload = parsed?.success ? (parsed.data as Record<string, unknown>) : null;
    return {
      id: c.id,
      hospitalId: c.hospitalId,
      hospital: c.hospitalId ? (hospital ?? "Hospital") : "All hospitals",
      what: KIND_WORDS[kind] ?? c.kind,
      key: typeof payload?.concept === "string" ? payload.concept : c.key,
      version: c.version,
      authoredBy: author ?? "Staff",
      leadSignedBy: c.leadSignedBy!,
      leadName: lead ?? "Staff",
      leadSignedAt: c.leadSignedAt,
      exceptionNote: c.exceptionNote,
      summary: payload ? summary(kind, payload, c.key) : "Does not read as its kind",
      lines: payload ? lines(kind, payload) : ["This payload does not read as its kind."],
    };
  });
}

/** One bound in words: "below 8.0", "from 8.0 to below 11.0", "11.0 or above". */
export function boundWords(b: {
  from: string | null;
  fromInclusive: boolean;
  to: string | null;
  toInclusive: boolean;
}): string {
  if (b.from === null && b.to === null) return "any value";
  if (b.from === null) return b.toInclusive ? `${b.to} or below` : `below ${b.to}`;
  if (b.to === null) return b.fromInclusive ? `${b.from} or above` : `above ${b.from}`;
  return `${b.fromInclusive ? "from" : "above"} ${b.from} to ${b.toInclusive ? "" : "below "}${b.to}`;
}

function summary(kind: ConfigKind, p: Record<string, unknown>, key = ""): string {
  switch (kind) {
    case "scheme": {
      const s = p as SchemePayload;
      return `${s.label} · ${s.rows.length} ${s.rows.length === 1 ? "row" : "rows"}`;
    }
    case "flag_basis":
      return p.basis === "scheme" ? "Decision cut-offs" : "Reference interval";
    case "elevation":
      return `${p.metres} m · ${p.source}`;
    case "hiv_algorithm":
      return (p.assays as { kit: string }[]).map((a) => a.kit).join(", ");
    case "addendum":
      return `hash ${String(p.hash).slice(0, 12)}`;
    case "ncd_mapping":
      return `${p.concept} in ${p.unit}`;
    case "ref":
      return key;
    case "acceptance_plan":
      return String(p.method).replace("_", " ");
    case "qc_plan":
      return `${key} · ${(p.levels as unknown[]).length} levels · reject ${(p.rejectRules as string[]).join(", ")}`;
    case "qc_policy":
      return `${p.minRunsForTarget} runs over ${p.minDaysForTarget} days`;
    case "kit_qc_rule":
      return `${(p.controls as unknown[]).length} controls${p.requiredBeforeUse ? " · required before use" : ""}`;
    case "device_qc_rule":
      return `${key} · ${(p.levels as string[]).join(", ")}${p.requiredBeforeUse ? " · required before use" : ""}`;
    case "competency_validity":
      return `${key} · valid ${p.validDays} days · grace ${p.graceDays} days`;
    case "hmis_mapping":
      return `${key} · ${(p.rows as unknown[]).length} rows mapped`;
    case "register_config":
      return `${key} · ${(p.columns as unknown[]).length} columns`;
    case "partner_tests":
      return `${(p.tests as unknown[]).length} tests`;
    case "partner_packing":
      return `${String(p.category)} · ${(p.items as unknown[]).length} items`;
    case "partner_legal":
      return `basis ${String(p.basis).replace(/_/g, " ")}`;
    case "partner_fields":
      return `${(p.fields as unknown[]).length} fields${p.clinicalQuestion ? " · clinical question" : ""}`;
    case "referral_ops":
      return `presence ${String(p.presenceMinutes)} min`;
    case "referral_wording":
      return String(p.procedureRef);
    case "patient_release":
      return `hold up to ${p.holdMaxDays} days · aged after ${p.agedWindowDays} days`;
    case "plain_words":
    case "sms_template":
      return key;
    case "minors_rule":
      return `opinion ${String(p.legalOpinionRef)}`;
    case "patient_floor_additions":
      return (p.testCodes as string[]).join(", ");
    case "results_consent_notice":
      return `version ${String(p.version)}`;
    case "delta_rule":
      return `${String(p.concept)} · ${String(p.type).replace("_", " ")} · ${(p.basis as { kind: string }).kind.replace(/_/g, " ")} basis`;
    case "panel_rule":
      return `${String(p.testCode)} · ${String(p.k)} of ${(p.components as unknown[]).length}`;
    case "pattern_rule":
      return String(p.name);
    case "ipc_alert_entry":
      return String(p.condition);
  }
}

const age = (from: number | null, to: number | null) =>
  from === null && to === null ? "any age" : `age ${from ?? 0} to ${to ?? "…"} days`;

/** The payload as readable lines for the View dialog: no raw JSON. */
function lines(kind: ConfigKind, p: Record<string, unknown>): string[] {
  switch (kind) {
    case "scheme": {
      const s = p as SchemePayload;
      const cat = new Map(s.categories.map((c) => [c.code, c.label]));
      return [
        `Label: ${s.label}`,
        `Concept: ${s.concept}`,
        `Unit: ${s.unit}`,
        `Source: ${s.source}`,
        `Categories: ${s.categories.map((c) => `${c.label}${c.abnormal ? " (abnormal)" : ""}`).join(", ")}`,
        ...s.rows.flatMap((r, i) => [
          `Row ${i + 1}: ${r.sex === "any" ? "any sex" : r.sex}, ${age(r.ageFromDays, r.ageToDays)}, ${r.context.replace("_", " ")}${
            r.gestationFromDays != null || r.gestationToDays != null
              ? `, gestation ${r.gestationFromDays ?? 0} to ${r.gestationToDays ?? "…"} days`
              : ""
          }, ${r.methods.join(" and ")} · source: ${r.source}`,
          ...r.bounds.map(
            (b) => `  ${cat.get(b.category) ?? b.category}: ${boundWords(b)} ${s.unit}`,
          ),
        ]),
        ...(s.elevation
          ? [
              `Elevation adjustment (${s.elevation.unit}) · source: ${s.elevation.source}`,
              ...s.elevation.table.map(
                (t) => `  ${t.fromM} m to ${t.toM} m: add ${t.amount} ${s.elevation!.unit}`,
              ),
            ]
          : []),
      ];
    }
    case "flag_basis":
      return [`Flag against: ${summary(kind, p)}`];
    case "elevation":
      return [`Metres above sea level: ${p.metres}`, `Source: ${p.source}`];
    case "hiv_algorithm": {
      const h = p as {
        assays: { step: number; kit: string }[];
        rules: { t1: string; t2: string | null; t3: string | null; outcome: string }[];
        retestDays: number;
        circular: string;
      };
      const w = (v: string) => v.replace("_", "-");
      return [
        ...h.assays.map((a) => `Test ${a.step}: ${a.kit}`),
        ...h.rules.map(
          (r) =>
            `Test 1 ${w(r.t1)}${r.t2 ? `, test 2 ${w(r.t2)}` : ""}${r.t3 ? `, test 3 ${w(r.t3)}` : ""}: ${r.outcome.replace("_", ", ")}`,
        ),
        `Retest after ${h.retestDays} days`,
        `Circular: ${h.circular}`,
      ];
    }
    case "ncd_mapping":
      return [
        `Concept: ${p.concept}`,
        `Unit: ${p.unit}`,
        `Methods: ${(p.methods as string[]).join(" and ")}`,
        `Window: ${p.windowDays} days`,
      ];
    case "ref":
      return [
        ...Object.entries(p.constants as Record<string, string>).map(([k, v]) => `${k}: ${v}`),
        `Source: ${p.source}`,
      ];
    case "addendum":
      return [`Data file hash: ${p.hash}`];
    case "acceptance_plan":
      return [`Method: ${summary(kind, p)}`, `Source: ${p.source}`];
    case "qc_plan": {
      const q = p as {
        unit: string;
        levels: { level: number; label: string }[];
        frequency: { kind: string; n?: number };
        rejectRules: string[];
        warnRules: string[];
        holdWhenNotRun: boolean;
        targets: { level: number; mean: number; sd: number; source: string }[];
        source: string;
      };
      return [
        ...q.levels.map((l) => `Level ${l.level}: ${l.label}`),
        `Frequency: ${q.frequency.kind.replaceAll("_", " ")}${q.frequency.n ? ` (${q.frequency.n})` : ""}`,
        `Reject on: ${q.rejectRules.join(", ")}`,
        `Warn on: ${q.warnRules.join(", ") || "none"}`,
        `Hold release when QC is not run: ${q.holdWhenNotRun ? "yes" : "no"}`,
        ...q.targets.map(
          (t) =>
            `Target level ${t.level}: ${t.mean} ± ${t.sd} ${q.unit} (${t.source === "lab" ? "this lab's own" : "maker's range, provisional"})`,
        ),
        `Source: ${q.source}`,
      ];
    }
    case "qc_policy":
      return [summary(kind, p), ...(p.sources as string[]).map((s) => `Source: ${s}`)];
    case "kit_qc_rule":
      return [summary(kind, p), `Source: ${p.source}`];
    case "device_qc_rule":
      return [
        `Due: ${(p.triggers as string[]).map((t) => t.replaceAll("_", " ")).join(", ")}`,
        `Levels: ${(p.levels as string[]).join(", ")}`,
        `Required before use: ${p.requiredBeforeUse ? "yes" : "no"}`,
        `Source: ${p.source}`,
      ];
    case "competency_validity":
      return [
        `Methods: ${(p.methods as string[]).map((m) => m.replaceAll("_", " ")).join(", ")}`,
        `Valid for ${p.validDays} days; grace period at switch-on ${p.graceDays} days`,
        `Source: ${p.source}`,
      ];
    case "hmis_mapping":
      return [summary(kind, p), `Form hash: ${p.formHash}`];
    case "register_config":
      return (p.columns as { label: string }[]).map((c, i) => `Column ${i + 1}: ${c.label}`);
    case "partner_tests":
      return (
        p.tests as {
          testCode: string;
          theirCode: string;
          turnaround?: { value: number; unit: string };
        }[]
      ).map(
        (t) =>
          `${t.testCode} → ${t.theirCode} · ${t.turnaround ? `${t.turnaround.value} ${t.turnaround.unit.replace("_", " ")}` : "turnaround not stated"}`,
      );
    case "partner_packing":
      return (p.items as { words: string }[]).map((i, n) => `Item ${n + 1}: ${i.words}`);
    case "partner_legal":
    case "partner_fields":
    case "referral_ops":
    case "referral_wording":
    case "patient_release":
    case "plain_words":
    case "minors_rule":
    case "sms_template":
    case "patient_floor_additions":
    case "results_consent_notice":
    case "delta_rule":
    case "panel_rule":
    case "pattern_rule":
    case "ipc_alert_entry":
      return [summary(kind, p)];
  }
}
