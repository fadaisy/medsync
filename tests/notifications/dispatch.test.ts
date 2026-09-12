import type { ReminderRow, SmsSender } from "@/lib/notifications/sink";
import { describe, expect, it } from "vitest";

import {
  composeReminderSms,
  deliverSms,
  hasTransport,
  isGsmSafe,
  MAX_SENDS_PER_RUN,
  planReminderDispatch,
  SMS_MAX_BODY_CHARS,
  STALE_GRACE_MINUTES,
} from "@/lib/notifications/sink";

/**
 * Appointment-reminder dispatch decisions. Pure — no DB, no network, and
 * no phone number anywhere in the inputs.
 *
 * The two things that must never break: a row another run already claimed
 * is never sent again (a duplicate SMS is money, twice), and no single run
 * can exceed the send cap (a loop is money, unboundedly).
 */

const NOW = new Date("2026-03-12T09:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString();

let seq = 0;
const row = (over: Partial<ReminderRow> = {}): ReminderRow => {
  seq += 1;
  return {
    reminderId: `rem-${seq}`,
    appointmentId: `appt-${seq}`,
    channel: "sms",
    state: "queued",
    scheduledAtIso: minutes(-5),
    appointmentStartsAtIso: minutes(60),
    appointmentStatus: "confirmed",
    patientUserId: `pat-${seq}`,
    hospitalName: "Mulago NRH",
    ...over,
  };
};

const plan = (rows: ReminderRow[], now = NOW) => planReminderDispatch({ rows, now });
const reasons = (rows: ReminderRow[]) => plan(rows).reaps.map((r) => `${r.state}:${r.reason}`);

describe("planReminderDispatch — what goes out", () => {
  it("a due reminder for a confirmed, future appointment sends", () => {
    const { sends, reaps } = plan([row()]);
    expect(sends).toHaveLength(1);
    expect(reaps).toHaveLength(0);
    expect(sends[0]?.body).toContain("appointment");
  });

  it("a reminder that is not due yet is held, not sent", () => {
    const { sends, held } = plan([row({ scheduledAtIso: minutes(30) })]);
    expect(sends).toHaveLength(0);
    expect(held.not_due).toBe(1);
  });

  it("a row already claimed by another run is never re-sent", () => {
    // The conditional UPDATE is the real guard; this is the second one.
    for (const state of ["sent", "failed", "cancelled"]) {
      const { sends, reaps, held } = plan([row({ state })]);
      expect(sends).toHaveLength(0);
      expect(reaps).toHaveLength(0);
      expect(held.not_queued).toBe(1);
    }
  });
});

describe("planReminderDispatch — what is refused", () => {
  it("reaps a reminder whose appointment is no longer live", () => {
    expect(
      reasons([
        row({ appointmentStatus: "cancelled" }),
        row({ appointmentStatus: "declined" }),
        row({ appointmentStatus: "no_show" }),
        row({ appointmentStatus: "completed" }),
        row({ appointmentStatus: "rescheduled" }),
      ]),
    ).toEqual([
      "cancelled:appointment_cancelled",
      "cancelled:appointment_declined",
      "cancelled:appointment_no_show",
      "cancelled:appointment_completed",
      "cancelled:appointment_rescheduled",
    ]);
  });

  it("never sends for an appointment that has already started", () => {
    const { sends, reaps } = plan([row({ appointmentStartsAtIso: minutes(-1) })]);
    expect(sends).toHaveLength(0);
    expect(reaps[0]).toMatchObject({ state: "failed", reason: "appointment_elapsed" });
  });

  it("drops a reminder stale past the grace window instead of blasting a backlog", () => {
    const stale = row({
      scheduledAtIso: minutes(-(STALE_GRACE_MINUTES + 1)),
      appointmentStartsAtIso: minutes(600),
    });
    const fresh = row({
      scheduledAtIso: minutes(-(STALE_GRACE_MINUTES - 1)),
      appointmentStartsAtIso: minutes(600),
    });
    expect(plan([stale]).reaps[0]).toMatchObject({ state: "failed", reason: "stale" });
    expect(plan([fresh]).sends).toHaveLength(1);
  });

  it("holds an unconfirmed request rather than promising an appointment", () => {
    for (const status of ["requested", "pending_approval"]) {
      const { sends, held } = plan([row({ appointmentStatus: status })]);
      expect(sends).toHaveLength(0);
      expect(held.awaiting_confirmation).toBe(1);
    }
  });

  it("reaps an unreadable timestamp instead of sending on NaN", () => {
    expect(plan([row({ scheduledAtIso: "not-a-date" })]).reaps[0]).toMatchObject({
      state: "failed",
      reason: "unreadable_timestamp",
    });
  });
});

describe("planReminderDispatch — the ceilings", () => {
  it("never exceeds the per-run send cap, and spends it on the soonest appointments", () => {
    const rows = Array.from({ length: MAX_SENDS_PER_RUN + 5 }, (_, i) =>
      row({ appointmentStartsAtIso: minutes(600 - i) }),
    );
    const { sends, held } = plan(rows);
    expect(sends).toHaveLength(MAX_SENDS_PER_RUN);
    expect(held.over_cap).toBe(5);
    // Last row built = soonest appointment = must be in the capped set.
    const last = rows[rows.length - 1] as ReminderRow;
    expect(sends.map((s) => s.reminderId)).toContain(last.reminderId);
  });

  it("sends one text per appointment per run, the nearest lead winning", () => {
    const dayBefore = row({ appointmentId: "appt-x", scheduledAtIso: minutes(-90) });
    const hourBefore = row({ appointmentId: "appt-x", scheduledAtIso: minutes(-2) });
    const { sends, reaps } = plan([dayBefore, hourBefore]);
    expect(sends).toHaveLength(1);
    expect(sends[0]?.reminderId).toBe(hourBefore.reminderId);
    expect(reaps).toEqual([
      { reminderId: dayBefore.reminderId, state: "failed", reason: "superseded" },
    ]);
  });
});

describe("the channel ladder", () => {
  it("only sms has a transport today", () => {
    expect(hasTransport("sms")).toBe(true);
    expect(["in_app", "push", "email"].map(hasTransport)).toEqual([false, false, false]);
  });

  it("a channel with no transport descends to sms and the substitution is recorded", () => {
    const { sends } = plan([row({ channel: "in_app" })]);
    expect(sends[0]?.substitutedFrom).toBe("in_app");
    expect(plan([row({ channel: "sms" })]).sends[0]?.substitutedFrom).toBeUndefined();
  });
});

describe("composeReminderSms", () => {
  const body = composeReminderSms({
    startsAtIso: "2026-03-13T07:30:00.000Z",
    hospitalName: "Mulago NRH",
  });

  it("renders the instant in East Africa Time", () => {
    // 07:30 UTC = 10:30 EAT, Friday 13 March.
    expect(body).toContain("Fri 13 Mar at 10:30");
  });

  it("carries no patient identity and no clinical reason", () => {
    expect(body).toMatch(/^MedSync: your appointment/);
    expect(body.toLowerCase()).not.toContain("follow");
  });

  it("fits one billable part, in GSM-safe characters", () => {
    const long = composeReminderSms({
      startsAtIso: "2026-03-13T07:30:00.000Z",
      hospitalName:
        "Mulago National Referral Hospital, Upper Mulago Hill Road, Kawempe Division, Kampala",
    });
    for (const candidate of [body, long]) {
      expect(candidate.length).toBeLessThanOrEqual(SMS_MAX_BODY_CHARS);
      expect(isGsmSafe(candidate)).toBe(true);
    }
    // The long name is dropped rather than truncated mid-address.
    expect(long).not.toContain("Mulago");
  });

  it("strips characters that would re-encode the message as UCS-2", () => {
    const fancy = composeReminderSms({
      startsAtIso: "2026-03-13T07:30:00.000Z",
      hospitalName: "St Mary’s Hôpital",
    });
    expect(isGsmSafe(fancy)).toBe(true);
    expect(fancy).toContain("St Mary's");
  });
});

describe("deliverSms", () => {
  const fakeSender = (fail = new Set<string>()) => {
    const seen: { toE164: string; body: string }[] = [];
    const sender: SmsSender = {
      async send({ toE164, body }) {
        seen.push({ toE164, body });
        if (fail.has(toE164)) return { ok: false, reason: "406: UserInBlacklist" };
        return { ok: true, providerMessageId: `m-${seen.length}` };
      },
    };
    return { sender, seen };
  };

  const job = (n: number) => ({
    reminderId: `rem-${n}`,
    toE164: `+2567000000${n}`,
    body: "MedSync: your appointment is on Fri 13 Mar at 10:30.",
  });

  it("sends each job exactly once and reports per-job outcomes", async () => {
    const { sender, seen } = fakeSender();
    const jobs = [job(1), job(2), job(3)];
    const outcomes = await deliverSms({ sender, jobs });
    expect(seen).toHaveLength(3);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(3);
    expect(outcomes.map((o) => o.reminderId)).toEqual(["rem-1", "rem-2", "rem-3"]);
  });

  it("surfaces the provider's own words and keeps going", async () => {
    const { sender, seen } = fakeSender(new Set(["+25670000002"]));
    const outcomes = await deliverSms({ sender, jobs: [job(1), job(2), job(3)] });
    expect(seen).toHaveLength(3);
    expect(outcomes[1]).toEqual({
      reminderId: "rem-2",
      ok: false,
      reason: "406: UserInBlacklist",
    });
  });

  it("a thrown sender fails one job, not the run", async () => {
    const sender: SmsSender = {
      async send({ toE164 }) {
        if (toE164.endsWith("2")) throw new Error("socket hang up");
        return { ok: true };
      },
    };
    const outcomes = await deliverSms({ sender, jobs: [job(1), job(2), job(3)] });
    expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
    expect(outcomes[1]?.reason).toContain("socket hang up");
  });

  it("refuses a body that would bill as several parts, without calling the provider", async () => {
    const { sender, seen } = fakeSender();
    const outcomes = await deliverSms({
      sender,
      jobs: [
        { reminderId: "long", toE164: "+256700000001", body: "x".repeat(SMS_MAX_BODY_CHARS + 1) },
        { reminderId: "ucs2", toE164: "+256700000002", body: "appointment — today" },
      ],
    });
    expect(seen).toHaveLength(0);
    expect(outcomes.every((o) => o.reason === "body_would_multi_part")).toBe(true);
  });
});
