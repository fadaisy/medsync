/**
 * The daily laboratory register (Lab Phase 3 §6.10, DR-1..DR-5; GATE A §3.1 `register_config`, §10). Pure.
 *
 * A read model: the caller hands in the day's register lines (as released at print time) and the signed column
 * configuration; this file chooses, orders and lays them out. Restricted classes never reach the general register.
 */
import { dayOf } from "@/lib/lab/stock";

/** One specimen × test line of the register, as released at print time (DR-5). */
export interface RegisterLine {
  hospitalId: string;
  sectionId: string;
  labNumber: string;
  receivedAt: Date;
  outcome:
    | { kind: "released"; at: Date; formAt: Date | null; amended: boolean }
    | { kind: "rejected"; at: Date }
    | null;
  /** `test_catalogue.restricted_class` (e.g. `hiv`); null = general. */
  restrictedClass: string | null;
  /** Display values by column key (patient, test, result, …). */
  values: Readonly<Record<string, string>>;
}

/** DR-2: the `register_config` payload. */
export interface RegisterConfig {
  columns: { key: string; label: string }[];
}

export type Register = { kind: "general" } | { kind: "class"; restrictedClass: string };

/**
 * DR-1, DR-3, DR-5: the register for one hospital, section and hospital-local day, in lab-number order. A line is
 * on the day its specimen was received and on the day it was released or rejected; a back-entered downtime result
 * sits on its form's day with "entered {date}"; an amendment sits on the day it was made, marked Amended.
 * A class register (HIV, TB, …) needs that access; the general register never carries a restricted class.
 */
export function dailyRegister(input: {
  hospitalId: string;
  sectionId: string;
  day: string;
  timeZone: string;
  register: Register;
  /** Classes the viewer may print (DR-3, GATE A §4). */
  classAccess: readonly string[];
  config: RegisterConfig;
  lines: readonly RegisterLine[];
}):
  | { ok: true; columns: string[]; rows: { labNumber: string; cells: string[]; notes: string[] }[] }
  | { ok: false; error: "no_class_access" } {
  const reg = input.register;
  if (reg.kind === "class" && !input.classAccess.includes(reg.restrictedClass))
    return { ok: false, error: "no_class_access" };
  const tz = input.timeZone;
  const rows = input.lines
    .filter(
      (l) =>
        l.hospitalId === input.hospitalId &&
        l.sectionId === input.sectionId &&
        (reg.kind === "general"
          ? l.restrictedClass === null
          : l.restrictedClass === reg.restrictedClass),
    )
    .filter((l) => {
      const o = l.outcome;
      const outcomeDay = o && dayOf(o.kind === "released" ? (o.formAt ?? o.at) : o.at, tz);
      return dayOf(l.receivedAt, tz) === input.day || outcomeDay === input.day;
    })
    .sort((a, b) => a.labNumber.localeCompare(b.labNumber, "en", { numeric: true }))
    .map((l) => {
      const notes: string[] = [];
      const o = l.outcome;
      if (o?.kind === "released" && o.formAt && dayOf(o.at, tz) !== dayOf(o.formAt, tz))
        notes.push(`entered ${dayOf(o.at, tz)}`);
      if (o?.kind === "released" && o.amended) notes.push("Amended");
      if (o?.kind === "rejected") notes.push("Rejected");
      return {
        labNumber: l.labNumber,
        cells: input.config.columns.map((c) => l.values[c.key] ?? ""),
        notes,
      };
    });
  return { ok: true, columns: input.config.columns.map((c) => c.label), rows };
}

/** DR-4: the print event (`lab_register_prints`), pages from the rows printed. */
export const printEvent = (input: {
  hospitalId: string;
  register: string;
  sectionId: string;
  day: string;
  rows: number;
  rowsPerPage: number;
  printedBy: string;
  printedAt: Date;
}) => ({
  hospitalId: input.hospitalId,
  register: input.register,
  sectionId: input.sectionId,
  day: input.day,
  pages: Math.max(1, Math.ceil(input.rows / input.rowsPerPage)),
  printedBy: input.printedBy,
  printedAt: input.printedAt,
});
