import "server-only";

import { readingsFrom } from "@patient-core/log";
import { cardLines, cardNumber, sexLetter, splitHistory } from "@patient-core/me-health";
import { isMissingTable } from "@patient-core/me-places";
import { readingValueText } from "@patient-core/readings";
import { eq } from "drizzle-orm";

import { HELP_COPY } from "@/content/patient/help";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { loadLog, loadMedicines } from "@/lib/patient-web/day";
import { loadCardIdentity, loadHistory } from "@/lib/patient-web/me-data";
import { createClient } from "@/lib/supabase/server";

/**
 * Help's signed-in reads. The medic card is the phone's `MedicLines` (mobile/src/app/help.tsx): the patient's
 * own name, sex, MedSync number, conditions (never a private one, S18), medicine names (never amounts, L5),
 * allergies in their own words and the last blood pressure, all from their own rows. Signed out, nothing here
 * runs (S23). The active share is `location_shares` under RLS, so a share started on the phone shows too.
 */

export interface MedicCard {
  number: string;
  title: string;
  lines: string[];
  /** The home facility's name, for "Message my care team". */
  facility: string | null;
}

export async function loadMedicCard(userId: string): Promise<MedicCard | null> {
  const [id, history, meds, log, user] = await Promise.all([
    loadCardIdentity(userId).catch(() => null),
    loadHistory(userId).catch(() => ({ status: "error" as const })),
    loadMedicines(userId).catch(() => null),
    loadLog(userId, 365).catch(() => []),
    db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .catch(() => []),
  ]);
  // Not a patient (a staff member opened Help): no card, as signed out.
  if (!id) return null;
  const C = HELP_COPY.medic;
  const own = cardLines(
    splitHistory(history.status === "ready" ? history.value : []),
    id.conditions,
  );
  const names = [
    ...new Set((meds?.meds ?? []).filter((m) => m.state === "active").map((m) => m.name)),
  ];
  const bp = readingsFrom(log).find((r) => r.input.kind === "bp");
  const name = user[0]?.fullName?.trim() || null;
  return {
    number: cardNumber(id.code),
    title: [name ?? C.noName, sexLetter(id.sex)].filter(Boolean).join(" · "),
    lines: [
      own.conditions === "None listed" ? C.noConditions : own.conditions,
      names.length ? C.medicines(names) : C.noMedicines,
      C.allergies(
        own.allergies === "None listed" ? null : own.allergies,
        bp ? readingValueText(bp.input) : null,
      ),
    ],
    facility: id.facility,
  };
}

export interface ActiveShare {
  id: string;
  token: string;
  endsAt: string;
  lastSentAt: string | null;
}

/** The live share, or `off` before migration 0185. Null when none runs. */
export async function loadActiveShare(): Promise<ActiveShare | null | "off"> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("location_shares")
    .select("id, token, ends_at, position_at")
    .is("stopped_at", null)
    .gt("ends_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissingTable(error)) return "off";
  if (error || !data) return null;
  return {
    id: data.id as string,
    token: data.token as string,
    endsAt: data.ends_at as string,
    lastSentAt: (data.position_at as string | null) ?? null,
  };
}
