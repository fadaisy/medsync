import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { decrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/exchange/store";

/** PR-10: the record's two identifiers for the header (name and hospital number); never a search. */
export async function identifiers(subject: string) {
  const [p] = rowsOf<{ first: string | null; surname: string | null; code: string | null }>(
    await db.execute(sql`SELECT first_name_encrypted AS first, surname_encrypted AS surname,
      patient_code AS code FROM patient_profiles WHERE id = ${subject}`),
  );
  const safe = (c: string | null) => {
    try {
      return c ? decrypt(c) : "";
    } catch {
      return "";
    }
  };
  return {
    name:
      [safe(p?.first ?? null), safe(p?.surname ?? null)].filter(Boolean).join(" ") || "Your record",
    number: p?.code ?? null,
  };
}
