import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";

import { computeDerivedMetrics } from "@/lib/triage/scoring/derived";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { TRIGGER_WORD } from "./close-out-words";

/**
 * Resus Desk v2 — how the record reads (prompt §5.8). Pure.
 * Times are pinned to the hospital's zone (a UTC server is three hours behind
 * Kampala), 24 h; days read "Wed 23 Sep"; vitals read as words, never keys.
 */

/* ─── Time ─────────────────────────────────────────────────────────── */

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number | string) => String(n).padStart(2, "0");

function parts(iso: string): Record<string, string> {
  return Object.fromEntries(PARTS.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
}

/** Bedside clock, 24 h: "17:06:41" (or "17:06"). */
export function clockOf(iso: string, seconds = true): string {
  const p = parts(iso);
  return seconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`;
}

/** The day an entry falls on: a sort key and "Wed 23 Sep". */
export function dayOf(iso: string): { key: string; label: string } {
  const p = parts(iso);
  return {
    key: `${p.year}-${pad(p.month!)}-${pad(p.day!)}`,
    label: `${p.weekday} ${pad(p.day!)} ${MONTHS[Number(p.month) - 1]}`,
  };
}

/** Offset from the start of the resus: "T+47:02", "T+1:47:02", "T−03:10". */
export function tPlus(atIso: string, startIso: string): string {
  const d = Math.round((Date.parse(atIso) - Date.parse(startIso)) / 1000);
  const s = Math.abs(d);
  const h = Math.floor(s / 3600);
  const body =
    h > 0
      ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
      : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  return `T${d < 0 ? "−" : "+"}${body}`;
}

/** Supplemental O₂ devices (Q9) — stored as the value, shown as the label. */
export const O2_DEVICES = [
  { value: "nasal_cannula", label: "Nasal cannula" },
  { value: "face_mask", label: "Face mask" },
  { value: "non_rebreather", label: "Non-rebreather" },
  { value: "venturi", label: "Venturi" },
  { value: "cpap_niv", label: "CPAP / NIV" },
  { value: "bvm", label: "BVM" },
  { value: "other", label: "Other" },
] as const;

export function o2DeviceLabel(value: string): string {
  return O2_DEVICES.find((d) => d.value === value)?.label ?? value;
}

/* ─── Words ────────────────────────────────────────────────────────── */

const FIELD_NAME: Record<string, string> = {
  hr: "HR",
  rr: "RR",
  spo2: "SpO₂",
  systolicBp: "SBP",
  diastolicBp: "DBP",
  temperature: "Temp",
  glucose: "Glucose",
  gcs: "GCS",
  etco2: "EtCO₂",
  urineOutput: "Urine",
  oxygen: "O₂",
};

/** "BP" for SBP + DBP, else the display names — never field keys. */
export function fieldNames(fields: readonly string[]): string {
  const bp = fields.includes("systolicBp") && fields.includes("diastolicBp");
  const rest = fields.filter((f) => !bp || (f !== "systolicBp" && f !== "diastolicBp"));
  return [...(bp ? ["BP"] : []), ...rest.map((f) => FIELD_NAME[f] ?? f)].join(", ");
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * "HR 130 · BP 70/60 (MAP 63) · SpO₂ 67 % air · RR 20 · T 35.4 · Glu 5.0".
 * `artefact(field)` marks a value annotated as artefact.
 */
export function formatVitals(
  s: Record<string, unknown>,
  artefact: (field: string) => boolean = () => false,
): string {
  const a = (...f: string[]) => (f.some(artefact) ? " (artefact)" : "");
  const out: string[] = [];
  const hr = num(s.hr);
  if (hr != null) out.push(`HR ${hr}${a("hr")}`);
  const sbp = num(s.systolicBp);
  const dbp = num(s.diastolicBp);
  if (sbp != null || dbp != null) {
    const map = computeDerivedMetrics({ systolicBp: sbp, diastolicBp: dbp }).meanArterialPressure;
    const mapText = map != null ? ` (MAP ${Math.round(map)})` : "";
    out.push(`BP ${sbp ?? "—"}/${dbp ?? "—"}${mapText}${a("systolicBp", "diastolicBp")}`);
  }
  const flow = num(s.o2FlowLpm);
  const device = typeof s.o2Device === "string" ? ` (${o2DeviceLabel(s.o2Device)})` : "";
  const o2 = `O₂${flow != null ? ` ${flow} L/min` : ""}${device}`;
  const spo2 = num(s.spo2);
  const onAir = s.oxygen === "air";
  const onO2 = s.oxygen === "oxygen";
  if (spo2 != null)
    out.push(`SpO₂ ${spo2} %${onAir ? " air" : onO2 ? ` on ${o2}` : ""}${a("spo2")}`);
  else if (onAir || onO2) out.push(onAir ? "On air" : o2);
  const rr = num(s.rr);
  if (rr != null) out.push(`RR ${rr}${a("rr")}`);
  const t = num(s.temperature);
  if (t != null) out.push(`T ${t.toFixed(1)}${a("temperature")}`);
  const glu = num(s.glucose);
  if (glu != null) out.push(`Glu ${glu.toFixed(1)}${a("glucose")}`);
  const gcs = num(s.gcs);
  if (gcs != null) out.push(`GCS ${gcs}${a("gcs")}`);
  if (typeof s.consciousness === "string") out.push(`ACVPU ${s.consciousness}`);
  const et = num(s.etco2);
  if (et != null) out.push(`EtCO₂ ${et} kPa${a("etco2")}`);
  const urine = num(s.urineOutput);
  if (urine != null) out.push(`Urine ${urine} mL${a("urineOutput")}`);
  return out.join(" · ");
}

/**
 * A shock's record label. Built here rather than read from the payload: the
 * server labels every null energy "highest setting", even a child's shock
 * logged without an energy (energySource "manual").
 */
export function shockLabel(energyJ: unknown, energySource: unknown, stacked: unknown): string {
  const energy =
    typeof energyJ === "number"
      ? `${energyJ} J`
      : energySource === "manual"
        ? "— energy not recorded"
        : "— highest setting";
  return `Shock ${energy}${stacked === true ? " (stacked)" : ""}`;
}

/** The last word for a row with no label of its own — never the raw kind (S4). */
const KIND_LABEL: Record<ResusEventKind, string> = {
  assessment: "Assessment",
  action: "Action",
  drug: "Drug given",
  fluid: "Fluid given",
  procedure: "Procedure",
  vital: "Vitals",
  decision: "Decision",
  role_change: "Role change",
  mobilisation: "Team alert",
  reassessment: "Reassessment",
  arrest_detected: "Cardiac arrest declared",
  cpr_started: "CPR started",
  handover: "Handover",
  note: "Note",
  context: "Patient context",
  rhythm_check: "Rhythm check",
  shock: "Shock",
  rosc: "ROSC",
  resuscitation_stopped: "Resuscitation stopped",
  death_confirmed: "Death confirmed",
};

/** Role codes as the record reads them ("Role assigned: CPR provider"). */
const ROLE_WORD: Record<string, string> = {
  leader: "Leader",
  airway: "Airway",
  circulation: "Circulation",
  scribe: "Scribe",
  runner: "Runner",
  cpr_provider: "CPR provider",
  family_liaison: "Family liaison",
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export function entryLabel(e: TimelineEvent): string {
  const p = e.payload;
  if (p.noteKind === "vital_annotation" && Array.isArray(p.fields))
    return `Marked artefact: ${fieldNames(p.fields as string[])}`;
  if (e.kind === "shock") return shockLabel(p.energyJ, p.energySource, p.stacked);
  if (e.kind === "role_change" && typeof p.role === "string" && ROLE_WORD[p.role])
    return `Role assigned: ${ROLE_WORD[p.role]}`;
  // The opening row carries only a summary with the trigger code in it.
  const summary = text(p.summary)?.replace(/\(([a-z0-9_]+)\)/, (m, k: string) =>
    TRIGGER_WORD[k] ? `(${TRIGGER_WORD[k]})` : m,
  );
  return text(p.label) ?? text(p.item) ?? summary ?? KIND_LABEL[e.kind] ?? "Entry";
}

/**
 * "1 mg (1:10 000 (100 micrograms/mL) — … (10 mL bolus))" → "1 mg · 1:10 000 (…)":
 * the stored dose wraps a concentration that has brackets of its own (S5).
 */
export function doseText(dose: string): string {
  const m = /^([^()]+?) \((.*\(.*)\)$/.exec(dose);
  return m ? `${m[1]} · ${m[2]}` : dose;
}

export function entryValues(e: TimelineEvent, artefactKeys: string): string | null {
  const p = e.payload;
  if (e.kind === "vital" && p.snapshot && typeof p.snapshot === "object") {
    const art = new Set(artefactKeys.split(","));
    return formatVitals(p.snapshot as Record<string, unknown>, (f) => art.has(f)) || null;
  }
  if ((e.kind === "drug" || e.kind === "fluid") && typeof p.dose === "string")
    return doseText(p.dose);
  if (typeof p.reason === "string" && p.reason.trim()) return `Reason: ${p.reason}`;
  return null;
}

/* ─── One-tap Undo (R1) ────────────────────────────────────────────── */

/** The console's one-tap kinds (arrest-console UNDOABLE) + the survey's one-tap logs. */
const ONE_TAP_KINDS: ReadonlySet<string> = new Set([
  "rhythm_check",
  "shock",
  "drug",
  "fluid",
  "procedure",
  "vital",
  "note",
  "action",
  "assessment",
  "reassessment",
]);
/** Decisions logged with one tap; every other decision (opening, CPR not attempted,
 *  treatment limitation, disposition, phase, cancel, closure) needs Correct…. */
const ONE_TAP_DECISIONS: ReadonlySet<string> = new Set([
  "reversible_cause",
  "post_rosc_item",
  "obeys_commands",
]);

/**
 * May the record offer one-tap Undo for this row? Never for ROSC, arrest
 * declaration / CPR start, stopping, death confirmation or a terminal
 * decision: those change the episode's state and need a correction with a
 * reason (a mistaken ROSC is a re-arrest, not an undo).
 */
export function undoableInRecord(e: TimelineEvent): boolean {
  if (e.payload.noteKind === "correction") return false;
  if (e.kind === "decision")
    return typeof e.payload.decision === "string" && ONE_TAP_DECISIONS.has(e.payload.decision);
  return ONE_TAP_KINDS.has(e.kind);
}
