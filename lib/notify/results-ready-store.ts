import "server-only";

import type { SmsTemplate } from "./results-ready";
import type { EmrDb } from "@/lib/emr/db";
import type { SmsSender } from "@/lib/notifications/sink";
import { sql } from "drizzle-orm";

import { blindIndex, decrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/exchange/store";
import { loadConfigs } from "@/lib/lab/catalogue-v2";
import { patientResultsSmsLiveFor } from "@/lib/lab/feature";
import { resultsFor } from "@/lib/lab/patient-results";
import { logger } from "@/lib/logger";
import { deliverSms } from "@/lib/notifications/sink";
import {
  BATCH_WINDOW_MINUTES,
  batchKey,
  nextSendTime,
  render,
  templateErrors,
} from "./results-ready";

/**
 * The results-ready SMS (Lab Phase 5 §5.3; PS-1..PS-6). Runs on the lab's every-minute tick, outside every release
 * transaction, so a send can never block or undo a release (PS-6). Two passes:
 *
 *  1. `enqueueResultsReady`: for each patient with results at a hospital where the SMS is live, the results that are
 *     now visible to the patient (or, under 18, to a linked guardian: PS-5) through the one gate, in a group whose
 *     signed rule allows SMS, and not yet announced. One `results_ready` dispatch per recipient per batching window
 *     (PS-3); later results in the window join it. Never-shown tests never reach this pass (S41).
 *  2. `sendResultsReady`: due rows, between 06:00 and 19:00 Kampala time only; the recipient's `results_sms` consent
 *     and the phone's STOP are checked at send; the signed template per language, never anything else. Delivery
 *     status and cost are stored, the body never; failures retry with backoff, then stop as failed.
 *
 * The announced report ids ride in the dispatch payload (ids only, no test, value or text).
 */

const MAX_ATTEMPTS = 5;
const conn = async (database?: EmrDb): Promise<EmrDb> =>
  database ?? ((await import("@/db")).db as unknown as EmrDb);

export async function enqueueResultsReady(now: Date, database?: EmrDb) {
  const db = await conn(database);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const subjects = rowsOf<{ patient: string; hospital: string }>(
    await db.execute(sql`SELECT DISTINCT patient_user_id AS patient, hospital_id AS hospital FROM diagnostic_reports
      WHERE kind = 'lab' AND status IN ('final','amended','corrected') AND issued_at > ${since}::timestamptz`),
  ).filter((s) => patientResultsSmsLiveFor(s.hospital));
  let queued = 0;
  for (const p of [...new Set(subjects.map((s) => s.patient))]) {
    const guardians = rowsOf<{ g: string }>(
      await db.execute(sql`SELECT DISTINCT guardian_user_id AS g FROM guardian_links
        WHERE child_user_id = ${p} AND ended_at IS NULL`),
    ).map((r) => r.g);
    // The patient themself; a child's results go to the linked guardian only (PS-5), which the gate decides.
    for (const viewer of [p, ...guardians]) {
      const res = await resultsFor({ userId: viewer, subjectUserId: p }, now, db);
      if (!res || res.blocked) continue;
      const eligible = res.ready.filter((c) => c.sms && !c.beingChecked);
      if (!eligible.length) continue;
      const consent = rowsOf<{ ok: number }>(
        await db.execute(sql`SELECT 1 AS ok FROM consent_records WHERE user_id = ${viewer}
          AND consent_type = 'results_sms' AND revoked_at IS NULL LIMIT 1`),
      );
      if (!consent.length) continue;
      const announced = new Set(
        rowsOf<{ id: string }>(
          await db.execute(sql`SELECT jsonb_array_elements_text(payload->'reports') AS id FROM notification_dispatches
            WHERE kind = 'results_ready' AND related_id = ${p} AND recipient_user_id = ${viewer}`),
        ).map((r) => r.id),
      );
      const fresh = eligible.filter((c) => !announced.has(c.reportId));
      if (!fresh.length) continue;
      const ids = fresh.map((c) => c.reportId);
      const hospital = fresh[0]!.hospitalId;
      // One message per recipient per window: join a row of this window still waiting, else open the next slot.
      const slot = (at: Date) => batchKey(`${p}:${viewer}`, at);
      const [open] = rowsOf<{ id: string; state: string }>(
        await db.execute(
          sql`SELECT id, state FROM notification_dispatches WHERE idempotency_key = ${slot(now)}`,
        ),
      );
      if (open && (open.state === "queued" || open.state === "held")) {
        await db.execute(sql`UPDATE notification_dispatches
          SET payload = jsonb_set(payload, '{reports}', (payload->'reports') || ${JSON.stringify(ids)}::jsonb),
              updated_at = now() WHERE id = ${open.id}`);
        continue;
      }
      const at = open
        ? new Date(
            (Math.floor(now.getTime() / (BATCH_WINDOW_MINUTES * 60_000)) + 1) *
              BATCH_WINDOW_MINUTES *
              60_000,
          )
        : now;
      await db.execute(sql`INSERT INTO notification_dispatches (hospital_id, kind, recipient_user_id, language, channel,
          scheduled_at, state, idempotency_key, related_kind, related_id, payload)
        VALUES (${hospital}, 'results_ready', ${viewer}, 'en', 'sms', ${nextSendTime(at).toISOString()}::timestamptz,
          'queued', ${slot(at)}, 'patient', ${p}, ${JSON.stringify({ reports: ids, attempts: 0 })}::jsonb)
        ON CONFLICT (idempotency_key) DO UPDATE
          SET payload = jsonb_set(notification_dispatches.payload, '{reports}',
                (notification_dispatches.payload->'reports') || ${JSON.stringify(ids)}::jsonb)`);
      queued += 1;
    }
  }
  return { queued };
}

export async function sendResultsReady(now: Date, sender: SmsSender, database?: EmrDb) {
  const db = await conn(database);
  const due = rowsOf<{
    id: string;
    hospital: string;
    recipient: string;
    language: string;
    payload: { reports: string[]; attempts?: number };
  }>(
    await db.execute(sql`SELECT id, hospital_id AS hospital, recipient_user_id AS recipient, language, payload
      FROM notification_dispatches WHERE kind = 'results_ready' AND state IN ('queued','held')
        AND scheduled_at <= ${now.toISOString()}::timestamptz ORDER BY scheduled_at LIMIT 100`),
  );
  const finish = (id: string, state: string, reason: string) =>
    db.execute(sql`UPDATE notification_dispatches SET state = ${state}, failure_reason = ${reason},
      updated_at = now() WHERE id = ${id} AND state IN ('queued','held')`);
  let sent = 0;
  for (const d of due) {
    const when = nextSendTime(now);
    if (when > now) {
      // PS-3: after 19:00 it waits for 06:00. Delayed, never dropped.
      await db.execute(sql`UPDATE notification_dispatches SET state = 'held', scheduled_at = ${when.toISOString()}::timestamptz,
        updated_at = now() WHERE id = ${d.id}`);
      continue;
    }
    if (!patientResultsSmsLiveFor(d.hospital)) {
      await finish(d.id, "cancelled", "switched_off");
      continue;
    }
    const [consent] = rowsOf<{ ok: number }>(
      await db.execute(sql`SELECT 1 AS ok FROM consent_records WHERE user_id = ${d.recipient}
        AND consent_type = 'results_sms' AND revoked_at IS NULL LIMIT 1`),
    );
    if (!consent) {
      await finish(d.id, "cancelled", "no_consent");
      continue;
    }
    const [who] = rowsOf<{ phone: string | null; hospital: string }>(
      await db.execute(sql`SELECT p.phone_encrypted AS phone, h.name AS hospital FROM patient_profiles p, hospitals h
        WHERE p.id = ${d.recipient} AND h.id = ${d.hospital}`),
    );
    let phone: string | null = null;
    try {
      phone = who?.phone ? decrypt(who.phone) : null;
    } catch {
      phone = null;
    }
    if (!phone) {
      await finish(d.id, "failed", "no_reachable_phone");
      continue;
    }
    const [stopped] = rowsOf<{ ok: number }>(
      await db.execute(
        sql`SELECT 1 AS ok FROM sms_opt_outs WHERE phone_hmac = ${blindIndex(phone)}`,
      ),
    );
    if (stopped) {
      await finish(d.id, "cancelled", "sms_opted_out");
      continue;
    }
    const template = (await db.transaction((tx) => loadConfigs(tx, d.hospital))).find(
      (c) =>
        c.hospitalId === d.hospital &&
        c.kind === "sms_template" &&
        c.key === d.language &&
        c.status === "signed" &&
        c.inForceFrom !== null &&
        c.inForceFrom <= now,
    )?.payload as SmsTemplate | undefined;
    // PS-1: only the signed template, and only if it still passes the check.
    if (!template || templateErrors(template).length) {
      await finish(d.id, "cancelled", "template_unsigned");
      continue;
    }
    const claimed = rowsOf<{ id: string }>(
      await db.execute(sql`UPDATE notification_dispatches SET state = 'sent', sent_at = now(), updated_at = now()
        WHERE id = ${d.id} AND state IN ('queued','held') RETURNING id`),
    );
    if (!claimed.length) continue;
    const [o] = await deliverSms({
      sender,
      jobs: [{ reminderId: d.id, toE164: phone, body: render(template.text, who!.hospital) }],
    });
    if (o?.ok) {
      sent += 1;
      await db.execute(sql`UPDATE notification_dispatches SET provider_message_id = ${o.providerMessageId ?? null},
        cost_amount = ${o.cost?.amount ?? null}, cost_currency = ${o.cost?.currency ?? null}, updated_at = now()
        WHERE id = ${d.id}`);
      continue;
    }
    const attempts = (d.payload.attempts ?? 0) + 1;
    logger.warn("results_ready.send_failed", { dispatchId: d.id, attempts });
    await db.execute(sql`UPDATE notification_dispatches SET
        state = ${attempts < MAX_ATTEMPTS ? "queued" : "failed"}, sent_at = NULL,
        failure_reason = ${(o?.reason ?? "send_failed").slice(0, 300)},
        scheduled_at = ${new Date(now.getTime() + attempts * 5 * 60_000).toISOString()}::timestamptz,
        payload = jsonb_set(payload, '{attempts}', ${String(attempts)}::jsonb), updated_at = now()
      WHERE id = ${d.id}`);
  }
  return { due: due.length, sent };
}
