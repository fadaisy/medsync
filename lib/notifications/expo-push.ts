import "server-only";

import { env } from "@/lib/env";

/**
 * Expo push transport (Gate E, ADR 0090). Native `fetch`, no SDK.
 *
 *   POST https://exp.host/--/api/v2/push/send          ≤ 100 messages/request
 *   POST https://exp.host/--/api/v2/push/getReceipts   ≤ 1000 ids/request
 *
 * `EXPO_PUSH_ACCESS_TOKEN` is optional (Expo's "enhanced security"); when
 * set it goes as a Bearer header. Nothing here throws: a transport failure
 * becomes a ticket error per message, and the dispatcher records it on the
 * row — the run has already claimed those rows, so a thrown sender would
 * strand every job behind it as sent-but-unsent.
 *
 * A ticket is NOT delivery. Expo hands back a ticket id per message; the
 * receipt (fetched the NEXT run) says whether Apple/Google took it, and a
 * `DeviceNotRegistered` receipt is the signal to drop the token.
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const SEND_CHUNK = 100;
const RECEIPT_CHUNK = 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  /** Ids only — never a name or a phone. */
  data?: Record<string, unknown>;
}

export type ExpoTicket =
  | { to: string; status: "ok"; id: string }
  | { to: string; status: "error"; message: string; error?: string };

export interface ExpoReceipt {
  id: string;
  status: "ok" | "error";
  message?: string;
  /** e.g. 'DeviceNotRegistered' */
  error?: string;
  /** Present on some error receipts; the token to drop. */
  expoPushToken?: string;
}

/** Well-formed Expo tokens only; anything else is refused before the wire. */
export const isExpoPushToken = (token: string) =>
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token);

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (env.EXPO_PUSH_ACCESS_TOKEN) h.Authorization = `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`;
  return h;
}

async function post(url: string, body: unknown): Promise<{ ok: true; json: unknown } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, reason: `http_${res.status}: ${text.slice(0, 200)}` };
    try {
      return { ok: true, json: JSON.parse(text) };
    } catch {
      return { ok: false, reason: `unparseable_response: ${text.slice(0, 200)}` };
    }
  } catch (e) {
    return { ok: false, reason: `transport_error: ${String(e)}` };
  }
}

/** One ticket per message, in order. Never throws. */
export async function sendExpoPush(messages: ReadonlyArray<ExpoPushMessage>): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += SEND_CHUNK) {
    const chunk = messages.slice(i, i + SEND_CHUNK);
    const result = await post(
      SEND_URL,
      chunk.map((m) => ({ ...m, sound: "default", priority: "high" })),
    );
    if (!result.ok) {
      for (const m of chunk) tickets.push({ to: m.to, status: "error", message: result.reason });
      continue;
    }
    const data = (result.json as { data?: unknown[] }).data;
    chunk.forEach((m, j) => {
      const t = (Array.isArray(data) ? data[j] : undefined) as
        | { status?: string; id?: string; message?: string; details?: { error?: string } }
        | undefined;
      if (t?.status === "ok" && t.id) tickets.push({ to: m.to, status: "ok", id: t.id });
      else {
        tickets.push({
          to: m.to,
          status: "error",
          message: t?.message ?? "no_ticket",
          ...(t?.details?.error ? { error: t.details.error } : {}),
        });
      }
    });
  }
  return tickets;
}

/** Receipts by ticket id. Ids Expo no longer knows (> 24 h) are simply absent. Never throws. */
export async function fetchExpoReceipts(ids: ReadonlyArray<string>): Promise<Map<string, ExpoReceipt>> {
  const out = new Map<string, ExpoReceipt>();
  for (let i = 0; i < ids.length; i += RECEIPT_CHUNK) {
    const chunk = ids.slice(i, i + RECEIPT_CHUNK);
    const result = await post(RECEIPTS_URL, { ids: chunk });
    if (!result.ok) continue;
    const data = (result.json as { data?: Record<string, unknown> }).data ?? {};
    for (const [id, raw] of Object.entries(data)) {
      const r = raw as {
        status?: string;
        message?: string;
        details?: { error?: string; expoPushToken?: string };
      };
      out.set(id, {
        id,
        status: r.status === "ok" ? "ok" : "error",
        ...(r.message ? { message: r.message } : {}),
        ...(r.details?.error ? { error: r.details.error } : {}),
        ...(r.details?.expoPushToken ? { expoPushToken: r.details.expoPushToken } : {}),
      });
    }
  }
  return out;
}
