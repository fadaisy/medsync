import type { ActOutcome, BookOutcome, UssdData, UssdEffect, UssdState } from "@/lib/channels/ussd";
import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { ussdSessions } from "@/db/schema/channels";
import { DEFAULT_LANGUAGE, isLanguage, t } from "@/lib/channels/strings";
import { callSystem } from "@/lib/channels/system-call";
import { applyInput, INITIAL_STATE, lastSegment, render, SCREEN_MAX } from "@/lib/channels/ussd";
import {
  loadDays,
  loadHospitals,
  loadKnown,
  loadLines,
  loadNames,
  loadNextVisit,
} from "@/lib/channels/ussd-data";
import { webhookAuthorised } from "@/lib/channels/webhook-auth";
import { blindIndex, encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatArrivalWindow, formatShortDate, formatTime } from "@/lib/patient/booking-format";

export const dynamic = "force-dynamic";
/** PRD §4.5: ≤ 2 s per step. Vercel's floor is what it is; the log line says what a step cost. */
export const maxDuration = 10;

/**
 * Africa's Talking USSD callback (Gate F, ADR 0091; PRD §3.2 journey 2).
 *
 * AT POSTs `application/x-www-form-urlencoded` { sessionId, serviceCode,
 * phoneNumber, text } on every key press, `text` being the whole "*"-joined
 * history; the answer is text/plain beginning "CON " (another screen) or
 * "END " (finish). Auth is the secret path segment + the optional IP
 * allowlist (`lib/channels/webhook-auth.ts`); a miss is a 404.
 *
 * The route owns I/O; the menu is `lib/channels/ussd.ts` (pure). Per call:
 * load or create the `ussd_sessions` row → if `text` is the one we already
 * answered, return the same screen (idempotent) → fetch the data the CURRENT
 * step needs → apply the last segment → run the effect through a service-role
 * function → fetch the NEW step's data → render → store. Ten minutes of
 * silence expires the row (swept by cleanup-drafts); a key press after that
 * gets "This session ended. Dial again."
 *
 * Identity: the carrier-verified phone. Encrypted + blind-indexed on the
 * row; never logged, never in the reply. Rate limit: 20 sessions per phone
 * per hour, answered with one END sentence and no row.
 */

const Callback = z.object({
  sessionId: z.string().min(1).max(120),
  serviceCode: z.string().max(40).optional(),
  phoneNumber: z.string().regex(/^\+?\d{9,15}$/),
  text: z.string().max(400).default(""),
});

const SESSIONS_PER_PHONE_PER_HOUR = 20;
const SESSION_TTL_MS = 10 * 60_000;

export async function POST(request: Request, ctx: { params: Promise<{ secret: string }> }) {
  const started = Date.now();
  const { secret } = await ctx.params;
  if (!webhookAuthorised(request, secret, env.USSD_WEBHOOK_SECRET)) {
    return new NextResponse(null, { status: 404 });
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return plain("END " + t(DEFAULT_LANGUAGE, "unavailable"));
  }
  const parsed = Callback.safeParse({
    sessionId: form.get("sessionId") ?? undefined,
    serviceCode: form.get("serviceCode") ?? undefined,
    phoneNumber: form.get("phoneNumber") ?? undefined,
    text: form.get("text") ?? "",
  });
  if (!parsed.success) return plain("END " + t(DEFAULT_LANGUAGE, "unavailable"));
  const { sessionId, text } = parsed.data;
  const phone = parsed.data.phoneNumber.startsWith("+")
    ? parsed.data.phoneNumber
    : `+${parsed.data.phoneNumber}`;
  const requestId = `ussd-${sessionId.slice(0, 24)}-${Date.now().toString(36)}`;

  try {
    const now = new Date();
    const phoneHmac = blindIndex(phone);

    const [row] = await db
      .select()
      .from(ussdSessions)
      .where(eq(ussdSessions.providerSessionId, sessionId))
      .limit(1);

    // The same callback again: the same screen, nothing done twice.
    if (row && row.lastInput === text && row.lastReply) {
      return plain(row.lastReply, started, "replay");
    }

    let state: UssdState;
    if (!row) {
      // A new dial: the per-phone gate, then the row.
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(ussdSessions)
        .where(
          and(
            eq(ussdSessions.phoneHmac, phoneHmac),
            gt(ussdSessions.createdAt, new Date(now.getTime() - 3_600_000)),
          ),
        );
      if ((count?.n ?? 0) >= SESSIONS_PER_PHONE_PER_HOUR) {
        logger.warn("ussd.rate_limited", { requestId });
        return plain(render(INITIAL_STATE, { tooMany: true }), started, "rate_limited");
      }
      await db
        .insert(ussdSessions)
        .values({
          providerSessionId: sessionId,
          phoneEncrypted: encrypt(phone),
          phoneHmac,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        })
        .onConflictDoNothing({ target: ussdSessions.providerSessionId });
      state = INITIAL_STATE;
    } else if (row.expiresAt.getTime() < now.getTime()) {
      return plain("END " + t(DEFAULT_LANGUAGE, "timed_out"), started, "expired");
    } else {
      state = {
        language: isLanguage(row.language) ? row.language : DEFAULT_LANGUAGE,
        step: row.step as UssdState["step"],
        selections: row.selections as UssdState["selections"],
      };
    }

    // 1. The current screen's data, so the input can be validated against it.
    const input = text === "" ? "" : lastSegment(text);
    const before = await dataFor(state, phoneHmac, now);
    const applied = applyInput(state, input, before);
    state = applied.state;

    // 2. The effect — book / cancel / confirm — through the service-role functions.
    let outcome: { booked?: BookOutcome; acted?: ActOutcome } = {};
    if (applied.effect) outcome = await runEffect(applied.effect, phone, sessionId, requestId);

    // 3. The new screen.
    const after = applied.invalid ? before : await dataFor(state, phoneHmac, now, outcome);
    const reply = fitReply(render(state, after, applied.invalid));
    // `undefined` leaves the column alone; a booking sets it.
    const provisionalId = outcome.booked?.ok ? (outcome.booked.provisionalId ?? null) : undefined;

    await db
      .update(ussdSessions)
      .set({
        language: state.language,
        step: state.step,
        selections: state.selections as Record<string, unknown>,
        hospitalId: state.selections.hospitalId ?? null,
        serviceLineId: state.selections.lineId ?? null,
        provisionalPatientId: provisionalId,
        lastInput: text,
        lastReply: reply,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      })
      .where(eq(ussdSessions.providerSessionId, sessionId));

    return plain(reply, started, state.step);
  } catch (e) {
    logger.error("ussd.failed", { requestId, reason: String(e) });
    return plain("END " + t(DEFAULT_LANGUAGE, "unavailable"), started, "error");
  }
}

/** Only what the step on screen needs. */
async function dataFor(
  state: UssdState,
  phoneHmac: string,
  now: Date,
  outcome: { booked?: BookOutcome; acted?: ActOutcome } = {},
): Promise<UssdData> {
  const sel = state.selections;
  switch (state.step) {
    case "hospital":
      return { hospitals: await loadHospitals(now) };
    case "line":
      return sel.hospitalId ? { lines: await loadLines(sel.hospitalId) } : {};
    case "day":
      return sel.hospitalId && sel.lineId
        ? { days: await loadDays(sel.hospitalId, sel.lineId, now) }
        : {};
    case "name":
      return { known: await loadKnown(phoneHmac) };
    case "confirm": {
      if (!sel.hospitalId || !sel.lineId) return {};
      const names = await loadNames(sel.hospitalId, sel.lineId);
      // The day's label is re-derived from the pick so the confirm line
      // names what the caller chose, not a list position.
      const when =
        sel.slot?.starts_at ?? (sel.sessionId ? await sessionStart(sel.sessionId) : null);
      return {
        ...names,
        dayLabel: when
          ? sel.slot
            ? `${formatShortDate(when)} ${formatTime(when)}`
            : formatShortDate(when)
          : "",
      };
    }
    case "done":
      return sel.intent === "next" ? { nextVisit: await loadNextVisit(phoneHmac, now) } : outcome;
    default:
      return {};
  }
}

async function sessionStart(sessionId: string): Promise<string | null> {
  const [row] = await db.execute<{ starts_at: string }>(
    sql`select starts_at from public.clinic_sessions where id = ${sessionId}::uuid`,
  );
  return row?.starts_at ? new Date(row.starts_at).toISOString() : null;
}

async function runEffect(
  effect: UssdEffect,
  phone: string,
  sessionId: string,
  requestId: string,
): Promise<{ booked?: BookOutcome; acted?: ActOutcome }> {
  if (effect.kind === "book") {
    const res = await callSystem<{
      booking_code: string | null;
      position_number: number | null;
      arrival_window_start: string | null;
      arrival_window_end: string | null;
      provisional_patient_id: string | null;
    }>(
      "system-ussd-book",
      {
        phone_e164: phone,
        declared_name: effect.name,
        ...(effect.dateOfBirth ? { date_of_birth: effect.dateOfBirth } : { age_years: effect.age }),
        hospital_id: effect.hospitalId,
        service_line_id: effect.lineId,
        ...(effect.sessionId ? { session_id: effect.sessionId } : { slot: effect.slot }),
        idempotency_key: `ussd:${sessionId}`,
      },
      requestId,
    );
    if (!res.ok) return { booked: { ok: false, reason: res.error } };
    const d = res.data;
    const when = effect.slot?.starts_at ?? null;
    return {
      booked: {
        ok: true,
        code: d.booking_code ?? "",
        position: d.position_number,
        window:
          d.arrival_window_start && d.arrival_window_end
            ? formatArrivalWindow(d.arrival_window_start, d.arrival_window_end)
            : null,
        day: when ? formatShortDate(when) : "",
        time: when ? formatTime(when) : null,
        provisionalId: d.provisional_patient_id,
      },
    };
  }
  const res = await callSystem<{ appointment_id: string }>(
    "system-ussd-act",
    { action: effect.kind, booking_code: effect.code, phone_e164: phone, channel: "ussd" },
    requestId,
  );
  if (res.ok) return { acted: { ok: true, code: effect.code } };
  if (res.status === 409) {
    return {
      acted: { ok: false, key: effect.kind === "cancel" ? "not_cancellable" : "not_confirmable" },
    };
  }
  return { acted: { ok: false, key: "code_unknown" } };
}

/** The machine keeps the budget; this is the belt to its braces — never a partial word past 160. */
function fitReply(reply: string): string {
  if (reply.length <= SCREEN_MAX) return reply;
  const cut = reply.slice(0, SCREEN_MAX);
  const space = cut.lastIndexOf(" ");
  return (space > SCREEN_MAX - 30 ? cut.slice(0, space) : cut).trimEnd();
}

function plain(body: string, started?: number, step?: string): NextResponse {
  // PRD §4.5's budget, measured: the step and its milliseconds, nothing else.
  if (started !== undefined) logger.info("ussd.step", { step, ms: Date.now() - started });
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
