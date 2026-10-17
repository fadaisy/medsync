import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rowsOf } from "@/lib/exchange/store";

/**
 * Connections and the message queue (Lab Phase 4 §5.6; EX-4, EX-9): tiles, each sender's state, and the
 * messages with their latest state. Only the safe columns are read: `about` carries no patient detail and the
 * payload is never selected here (the raw view is its own audited action).
 */

/** AB-13's threshold (operational). */
export const HEARD_MINUTES = 15;

export interface ConnectionRow {
  id: string;
  kind: "partner" | "bridge";
  name: string;
  partner: string | null;
  state: "pairing" | "active" | "revoked";
  fingerprint: string | null;
  lastHeardAt: Date | null;
  enabledAt: Date | null;
  retryingSince: Date | null;
  /** AB-13: an active bridge not heard within the operational threshold. */
  quiet: boolean;
}
export interface MessageRow {
  id: string;
  direction: "in" | "out";
  sender: string | null;
  about: string;
  state: string;
  at: Date;
  outbox: string | null;
  lastError: string | null;
  receivedAt: Date;
}
/** The latest state of a message, leaving out the bookkeeping events. */
const LAST = sql`(SELECT e.state FROM exchange_events e WHERE e.message_id = m.id
  AND e.state NOT IN ('duplicate','raw_viewed') ORDER BY e.id DESC LIMIT 1)`;

export async function loadConnections(hospitalId: string): Promise<ConnectionRow[]> {
  return rowsOf<ConnectionRow>(
    await db.execute(sql`SELECT s.id, s.kind, s.name, p.name AS partner, s.state, s.key_fingerprint AS fingerprint,
        s.last_heard_at AS "lastHeardAt", s.enabled_at AS "enabledAt",
        (SELECT min(o.updated_at) FROM exchange_outbox o WHERE o.sender_id = s.id AND o.state = 'retrying') AS "retryingSince",
        (s.kind = 'bridge' AND s.state = 'active'
          AND coalesce(s.last_heard_at, s.enabled_at) < now() - make_interval(mins => ${HEARD_MINUTES})) AS quiet
      FROM exchange_senders s LEFT JOIN lab_partners p ON p.id = s.partner_id
     WHERE s.hospital_id = ${hospitalId} AND (s.state <> 'revoked' OR s.revoked_at > now() - interval '30 days')
     ORDER BY s.state = 'revoked', s.kind, s.name`),
  );
}

export async function loadExchangeTiles(hospitalId: string, dayStart: Date) {
  const [t] = rowsOf<{
    inToday: number;
    outToday: number;
    retrying: number;
    oldestRetry: Date | null;
    needsPerson: number;
  }>(
    await db.execute(sql`SELECT
        (SELECT count(*)::int FROM exchange_messages m WHERE m.hospital_id = ${hospitalId} AND m.direction = 'in'
           AND m.received_at >= ${dayStart}) AS "inToday",
        (SELECT count(*)::int FROM exchange_outbox o WHERE o.hospital_id = ${hospitalId} AND o.state = 'delivered'
           AND o.updated_at >= ${dayStart}) AS "outToday",
        (SELECT count(*)::int FROM exchange_outbox o WHERE o.hospital_id = ${hospitalId} AND o.state = 'retrying') AS retrying,
        (SELECT min(o.updated_at) FROM exchange_outbox o WHERE o.hospital_id = ${hospitalId} AND o.state = 'retrying') AS "oldestRetry",
        (SELECT count(*)::int FROM exchange_outbox o WHERE o.hospital_id = ${hospitalId} AND o.state = 'dead')
        + (SELECT count(*)::int FROM exchange_messages m WHERE m.hospital_id = ${hospitalId} AND m.direction = 'in'
             AND ${LAST} = 'unreadable') AS "needsPerson"`),
  );
  return t!;
}

/** "Not delivered" (default): outbound not yet delivered and inbound that is unreadable or still unprocessed. */
export async function loadMessages(
  hospitalId: string,
  view: "open" | "today",
  dayStart: Date,
): Promise<MessageRow[]> {
  const where =
    view === "today"
      ? sql`m.received_at >= ${dayStart}`
      : sql`((m.direction = 'out' AND o.state IN ('pending','retrying','sending','dead'))
            OR (m.direction = 'in' AND ${LAST} IN ('unreadable','received')))`;
  return rowsOf<MessageRow>(
    await db.execute(sql`SELECT m.id, m.direction, s.name AS sender, m.about, ${LAST} AS state,
        coalesce((SELECT max(e.at) FROM exchange_events e WHERE e.message_id = m.id), m.received_at) AS at,
        o.state AS outbox, o.last_error AS "lastError", m.received_at AS "receivedAt"
      FROM exchange_messages m
      LEFT JOIN exchange_senders s ON s.id = m.sender_id
      LEFT JOIN exchange_outbox o ON o.message_id = m.id
     WHERE m.hospital_id = ${hospitalId} AND m.channel <> 'manual_note' AND ${where}
     ORDER BY m.received_at DESC LIMIT 200`),
  );
}
