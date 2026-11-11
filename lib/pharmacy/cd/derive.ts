/**
 * Controlled drugs, pure (rework TECH-SPEC §3, ported from prototype cd.js): the dose maths (`cdUnit`, `doseUnits`),
 * registers, the last check and when one is due, the flags ("To fix") and a missing dose's window. Plain data in,
 * plain data out.
 */
import { CONTROLS_RULES as R } from "@/content/pharmacy-rework-controls";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface CdUnit {
  mg: number;
  ml: number;
  step: number;
  gapHours: number | null;
}

/** Strength per unit for a controlled medicine, by the substance in its name; null when the rules do not know it. */
export function cdUnit(name: string): CdUnit | null {
  const n = name.toLowerCase();
  const u = R.cdUnits.find((x) => n.includes(x.match));
  return u ? { mg: u.mg, ml: u.ml, step: u.step, gapHours: u.gapHours } : null;
}

/** Ampoules for a dose, and the residue left in the last one (mg and mL). */
export function doseUnits(doseMg: number, u: Pick<CdUnit, "mg" | "ml">) {
  if (!(doseMg > 0)) return { units: 0, residueMg: 0, residueMl: 0 };
  const units = Math.ceil(doseMg / u.mg - 1e-9);
  const residueMg = Math.round((units * u.mg - doseMg) * 100) / 100;
  return { units, residueMg, residueMl: Math.round((residueMg / u.mg) * u.ml * 100) / 100 };
}

export const mgFmt = (x: number) => (Math.round(x * 10) / 10).toString();

export interface CdDose {
  id: string;
  patient: string;
  bed: string | null;
  prescriber: string;
  givenBy: string | null;
  doseMg: number;
  route: string;
  residueMg: number;
  residueDisposed: boolean;
  lateEntry: boolean;
}

export interface CdEvent {
  kind: "witness_added" | "residue_recorded" | "early_reviewed" | "paper_checked";
  at: Date;
  by: string;
  reason: string | null;
  witness: string | null;
}

export interface CdMove {
  id: string;
  at: Date;
  recordedAt: Date;
  kind: string;
  qty: number;
  medicineId: string;
  medicineName: string;
  placeId: string;
  by: string;
  witness: string | null;
  paperWitness: string | null;
  late: boolean;
  reversed: boolean;
  note: string | null;
  dose: CdDose | null;
  events: CdEvent[];
}

export interface CdCheckLine {
  medicineId: string;
  expected: number;
  counted: number;
  resolution: { how: string; at: Date; by: string } | null;
}

export interface CdCheck {
  id: string;
  at: Date;
  placeId: string;
  by: string;
  witness: string | null;
  handover: boolean;
  lines: CdCheckLine[];
}

export interface CdPlace {
  id: string;
  name: string;
  kind: string;
}

export const checkStatus = (c: CdCheck) =>
  c.lines.every((l) => l.counted === l.expected)
    ? "ok"
    : c.lines.every((l) => l.counted === l.expected || l.resolution)
      ? "resolved"
      : "open";

export interface Register {
  medicineId: string;
  medicineName: string;
  placeId: string;
  balance: number;
}

/** One register per controlled medicine per place it has moved at, with its balance (the ledger's sum). */
export function cdRegisters(moves: readonly CdMove[]): Register[] {
  const by = new Map<string, Register>();
  for (const m of moves) {
    const k = `${m.medicineId}|${m.placeId}`;
    const r = by.get(k) ?? {
      medicineId: m.medicineId,
      medicineName: m.medicineName,
      placeId: m.placeId,
      balance: 0,
    };
    r.balance += m.qty;
    by.set(k, r);
  }
  return [...by.values()].sort((a, b) => a.medicineName.localeCompare(b.medicineName));
}

/** A handover that counted the controlled drugs writes a check, so it counts as one too. */
export const lastCheck = (checks: readonly CdCheck[], placeId: string) =>
  checks.filter((c) => c.placeId === placeId).sort((a, b) => b.at.getTime() - a.at.getTime())[0] ??
  null;

export function checkDue(checks: readonly CdCheck[], place: CdPlace, now: Date) {
  const c = lastCheck(checks, place.id);
  const every = (R.checkEveryDays[place.kind] ?? 1) * DAY;
  return !c || now.getTime() - c.at.getTime() > every;
}

export type CdFlagKind = "disc" | "wit" | "res" | "gap" | "due" | "paper";
export const FLAG_ORDER: readonly CdFlagKind[] = ["disc", "wit", "res", "gap", "due", "paper"];

export type CdFlag =
  | {
      k: "disc";
      id: string;
      placeId: string;
      medicineId: string;
      check: CdCheck;
      line: CdCheckLine;
    }
  | { k: "wit" | "res" | "paper"; id: string; placeId: string; medicineId: string; move: CdMove }
  | {
      k: "gap";
      id: string;
      placeId: string;
      medicineId: string;
      move: CdMove;
      prev: CdMove;
      hours: number;
      gapHours: number;
    }
  | { k: "due"; id: string; placeId: string; last: CdCheck | null };

const has = (m: CdMove, k: CdEvent["kind"]) => m.events.some((e) => e.kind === k);

/** What needs fixing, most serious first (prototype `cdFlags`). */
export function cdFlags(input: {
  moves: readonly CdMove[];
  checks: readonly CdCheck[];
  places: readonly CdPlace[];
  now: Date;
}): CdFlag[] {
  const f: CdFlag[] = [];
  for (const m of input.moves) {
    if (m.qty < 0 && !m.reversed && m.kind !== "reversed") {
      if (m.paperWitness && !has(m, "paper_checked"))
        f.push({
          k: "paper",
          id: `pw${m.id}`,
          placeId: m.placeId,
          medicineId: m.medicineId,
          move: m,
        });
      else if (!m.witness && !m.paperWitness && !has(m, "witness_added"))
        f.push({ k: "wit", id: `w${m.id}`, placeId: m.placeId, medicineId: m.medicineId, move: m });
    }
    if (m.dose && m.dose.residueMg > 0 && !m.dose.residueDisposed && !has(m, "residue_recorded"))
      f.push({ k: "res", id: `r${m.id}`, placeId: m.placeId, medicineId: m.medicineId, move: m });
  }
  const last = new Map<string, CdMove>();
  for (const m of [...input.moves]
    .filter((x) => x.dose)
    .sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const gapHours = cdUnit(m.medicineName)?.gapHours;
    if (!gapHours) continue;
    const key = `${m.medicineId}|${m.dose!.patient}`;
    const prev = last.get(key);
    if (prev && m.dose!.id !== prev.dose!.id) {
      const hours = (m.at.getTime() - prev.at.getTime()) / HOUR;
      if (hours < gapHours && !has(m, "early_reviewed"))
        f.push({
          k: "gap",
          id: `p${m.id}`,
          placeId: m.placeId,
          medicineId: m.medicineId,
          move: m,
          prev,
          hours,
          gapHours,
        });
    }
    last.set(key, m);
  }
  for (const c of input.checks)
    for (const l of c.lines)
      if (l.counted !== l.expected && !l.resolution)
        f.push({
          k: "disc",
          id: `d${c.id}${l.medicineId}`,
          placeId: c.placeId,
          medicineId: l.medicineId,
          check: c,
          line: l,
        });
  const held = new Set(cdRegisters(input.moves).map((r) => r.placeId));
  for (const p of input.places)
    if (held.has(p.id) && checkDue(input.checks, p, input.now))
      f.push({ k: "due", id: `c${p.id}`, placeId: p.id, last: lastCheck(input.checks, p.id) });
  return f.sort((a, b) => FLAG_ORDER.indexOf(a.k) - FLAG_ORDER.indexOf(b.k));
}

/**
 * Where a missing dose could have gone (prototype ResolveDialog): from the last count at this place that matched for
 * this medicine (or its first entry there) to this count.
 */
export function missingWindow(input: {
  check: CdCheck;
  medicineId: string;
  checks: readonly CdCheck[];
  moves: readonly CdMove[];
}): { from: Date; to: Date; fromMatch: boolean } {
  const c = input.check;
  const prevOk = input.checks
    .filter(
      (x) =>
        x.placeId === c.placeId &&
        x.at < c.at &&
        x.lines.some((y) => y.medicineId === input.medicineId && y.counted === y.expected),
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (prevOk) return { from: prevOk.at, to: c.at, fromMatch: true };
  const first = input.moves
    .filter((m) => m.medicineId === input.medicineId && m.placeId === c.placeId)
    .reduce<Date | null>((a, m) => (!a || m.at < a ? m.at : a), null);
  return { from: first ?? new Date(c.at.getTime() - DAY), to: c.at, fromMatch: false };
}

export const inWindow = (t: Date, w: { from: Date; to: Date }) => t > w.from && t < w.to;
