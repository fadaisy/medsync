/**
 * H5 legacy import (A6 back-entry). One CSV row = one historical visit; rows with the same person key
 * (hospital number, else names + date of birth) belong to one person. A dry run reports row-level
 * errors and probable duplicates before anything is written; the apply step goes through the normal
 * commands (search, person.enrol, registration, visit.record flagged historical).
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { applyCommand } from "../commands/apply";
import { authorize, moduleOf, NcdError, type NcdContext } from "../context";
import { rows as dbRows, withNcd } from "../db";
import { findCandidates } from "../commands/shared";
import { searchPersons } from "../search";

export const LEGACY_COLUMNS = [
  "hospital_number",
  "given_name",
  "family_name",
  "sex",
  "date_of_birth",
  "phone",
  "condition",
  "subtype",
  "basis_of_diagnosis",
  "diagnosis_year",
  "registration_date",
  "visit_date",
  "systolic",
  "diastolic",
  "weight_kg",
  "glucose_mmol",
  "glucose_type",
  "hba1c_percent",
  "medicines",
  "next_appointment",
] as const;
export const LEGACY_TEMPLATE = `${LEGACY_COLUMNS.join(",")}\n`;

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().nonnegative().nullable());
const rowSchema = z.object({
  hospital_number: z.string().trim().max(40),
  given_name: z.string().trim().min(1).max(60),
  family_name: z.string().trim().min(1).max(60),
  sex: z.enum(["female", "male"]),
  date_of_birth: iso,
  phone: z.string().trim().max(20),
  condition: z.string().trim().min(1),
  subtype: z.string().trim().min(1),
  basis_of_diagnosis: z.string().trim().min(1),
  diagnosis_year: z.preprocess(Number, z.number().int().min(1900).max(2100)),
  registration_date: iso,
  visit_date: iso,
  systolic: num,
  diastolic: num,
  weight_kg: num,
  glucose_mmol: num,
  glucose_type: z.enum(["fasting", "random", "post_meal", ""]),
  hba1c_percent: num,
  medicines: z.string().trim(),
  next_appointment: iso,
});
type Row = z.infer<typeof rowSchema>;

/** Minimal RFC 4180 parse (quotes, commas, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) out.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

export type DryRun = {
  rows: number;
  persons: number;
  errors: { line: number; message: string }[];
  duplicates: { line: number; tier: string; matched: string[] }[];
};

function parse(ctx: NcdContext, text: string) {
  const [header, ...body] = parseCsv(text);
  if (!header || LEGACY_COLUMNS.some((c, i) => header[i]?.trim() !== c)) throw new NcdError("invalid", `The header must be: ${LEGACY_COLUMNS.join(",")}`);
  const errors: DryRun["errors"] = [];
  const ok: { line: number; row: Row }[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const r = rowSchema.safeParse(Object.fromEntries(LEGACY_COLUMNS.map((c, j) => [c, cells[j] ?? ""])));
    if (!r.success) return errors.push({ line, message: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
    try {
      const m = moduleOf(ctx, r.data.condition);
      if (!m.subtypes.some((s) => s.code === r.data.subtype)) throw new Error(`subtype ${r.data.subtype}`);
      if (r.data.visit_date > ctx.today || r.data.registration_date > ctx.today) throw new Error("a date is in the future");
    } catch (e) {
      return errors.push({ line, message: (e as Error).message });
    }
    ok.push({ line, row: r.data });
  });
  const key = (r: Row) => r.hospital_number || `${r.given_name.toLowerCase()}|${r.family_name.toLowerCase()}|${r.date_of_birth}`;
  const groups = new Map<string, { line: number; row: Row }[]>();
  for (const x of ok) (groups.get(key(x.row)) ?? groups.set(key(x.row), []).get(key(x.row))!).push(x);
  return { errors, groups, total: body.length };
}

export async function legacyDryRun(ctx: NcdContext, text: string): Promise<DryRun> {
  authorize(ctx, "legacy_entry");
  const { errors, groups, total } = parse(ctx, text);
  const duplicates: DryRun["duplicates"] = [];
  await withNcd(
    ctx,
    "app",
    async (tx) => {
      for (const [, g] of groups) {
        const r = g[0]!.row;
        const c = await findCandidates(tx, ctx, {
          givenName: r.given_name,
          familyName: r.family_name,
          sex: r.sex,
          birthYear: Number(r.date_of_birth.slice(0, 4)),
          phones: [r.phone || null],
          hospitalNumber: r.hospital_number || null,
          nationalId: null,
        });
        for (const x of c.filter((y) => y.tier !== "possible")) duplicates.push({ line: g[0]!.line, tier: x.tier, matched: x.matched });
      }
    },
    ctx.db,
  );
  return { rows: total, persons: groups.size, errors, duplicates };
}

/** Writes only when the dry run is clean (no errors, no probable or definite duplicate). */
export async function legacyApply(ctx: NcdContext, text: string) {
  const dry = await legacyDryRun(ctx, text);
  if (dry.errors.length || dry.duplicates.length) throw new NcdError("invalid", "Fix the errors and settle the duplicates the dry run reported first.");
  const { groups } = parse(ctx, text);
  const [{ approved } = { approved: false }] = await withNcd(ctx, "app", (tx) => dbRows<{ approved: boolean }>(tx, sql`SELECT private.ncd_facility_approved(${ctx.facilityId}) AS approved`), ctx.db);
  let persons = 0;
  let visits = 0;
  for (const [, g] of groups) {
    const r = g[0]!.row;
    const { token } = await searchPersons(ctx, { givenName: r.given_name, familyName: r.family_name, sex: r.sex, birthYear: null, phones: [r.phone || null], hospitalNumber: r.hospital_number || null, nationalId: null });
    const personId = randomUUID();
    const regs = [...new Map(g.map((x) => [x.row.condition, x.row])).values()];
    const res = await applyCommand(ctx, {
      id: randomUUID(),
      type: "person.enrol",
      payload: {
        personId,
        searchToken: token,
        identity: { givenName: r.given_name, familyName: r.family_name, sex: r.sex, dateOfBirth: r.date_of_birth, phone1: r.phone || null, hospitalNumber: r.hospital_number || null },
        registrations: regs.map((x) => ({ registrationId: randomUUID(), condition: x.condition, subtype: x.subtype, basisOfDiagnosis: x.basis_of_diagnosis, diagnosisYear: x.diagnosis_year, registrationDate: x.registration_date })),
        privacy: { version: "0.1-draft", acknowledged: true },
        smsAllowed: false,
        callsAllowed: true,
        isSynthetic: !approved,
        confirmations: ["height_cm"],
      },
    });
    if (!res.ok) throw new NcdError(res.code === "error" ? "invalid" : res.code, `Line ${g[0]!.line}: ${res.message}`);
    persons++;
    for (const { line, row } of g.sort((a, b) => a.row.visit_date.localeCompare(b.row.visit_date))) {
      const v = await applyCommand(ctx, {
        id: randomUUID(),
        type: "visit.record",
        payload: {
          visitId: randomUUID(),
          personId,
          visitDate: row.visit_date,
          visitType: "scheduled",
          isHistorical: true,
          weightKg: row.weight_kg,
          bp: row.systolic != null && row.diastolic != null ? [[row.systolic, row.diastolic]] : [],
          glucose: row.glucose_mmol != null && row.glucose_type ? { value: row.glucose_mmol, unit: "mmol", type: row.glucose_type, method: "laboratory" } : null,
          hba1c: row.hba1c_percent != null ? { percent: row.hba1c_percent, resultDate: row.visit_date } : null,
          medicines: { codes: row.medicines ? row.medicines.split(";").map((m) => m.trim()).filter(Boolean) : [], confirmedUnchanged: false },
          nextAppointmentDate: row.next_appointment,
          confirmations: ["systolic", "diastolic", "systolic_not_above_diastolic", "weight_kg", "glucose_mmol", "hba1c_percent"],
        },
      });
      if (!v.ok) throw new NcdError(v.code === "error" ? "invalid" : v.code, `Line ${line}: ${v.message}`);
      visits++;
    }
  }
  return { persons, visits };
}
