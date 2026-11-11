import "server-only";

import type { SmsRule, SmsStatus } from "@/db/schema/pharmacy-rework-patients";
import type { EmrDb } from "@/lib/emr/db";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { rulesOf } from "@/lib/pharmacy/sms/store";
import { q } from "@/lib/pharmacy/wards/sql";

/** Reminders: today's messages (no phone numbers shown) or the rules. One query per tab. */
const appDb = async () => (await import("@/db")).db as unknown as EmrDb;

export const remindersData = cache(
  async (hospitalId: string, tab: string, nowMs: number, database?: EmrDb) => {
    const db = database ?? (await appDb());
    if (tab === "rules") return { tab: "rules" as const, rules: await rulesOf(db, hospitalId) };
    const day = new Date(nowMs + 3 * 3_600_000).toISOString().slice(0, 10);
    const messages = await q<{
      id: string;
      rule: SmsRule;
      recipient: string;
      body: string;
      lang: "en" | "lg";
      status: SmsStatus;
      cost: string | null;
      failure: string | null;
    }>(
      db,
      sql`SELECT id, rule, recipient, body, lang, status, cost, failure FROM public.pharmacy_sms_messages
         WHERE hospital_id = ${hospitalId}::uuid AND day = ${day}::date ORDER BY rule, recipient`,
    );
    return { tab: "today" as const, messages };
  },
);
