import type { AlertEvent, AlertRecord, Level } from "@/lib/lab/criticals/alerts";
import type { OpenAlert, ResponseTimes } from "@/lib/lab/criticals/escalation";
import type { LadderResult } from "@/lib/lab/criticals/recipients";
import { describe, expect, it } from "vitest";

import { alertInvariants, applyEvent, foldAlert, LAST_LEVEL } from "@/lib/lab/criticals/alerts";
import {
  applyStep,
  dueAtFor,
  escalateByHand,
  heartbeatStale,
  overdueAtLastLevel,
  planEscalations,
} from "@/lib/lab/criticals/escalation";
import { H_A, H_B, minutes, prng, T0 } from "./_fixtures";

/** Fixture response times: invented minutes, not a clinical number. */
const TIMES: ResponseTimes = { ackWithinMin: 30, level1AfterMin: 20, level2AfterMin: 15 };
const timesFor = (h: string) => (h === H_A ? TIMES : null);
const ladder =
  (empty: Level[] = []) =>
  (_a: OpenAlert, from: Level): LadderResult => {
    for (let l = from; l <= LAST_LEVEL; l++) {
      if (!empty.includes(l as Level))
        return {
          level: l as Level,
          recipients: [`r${l}`],
          skipped: [],
          emptyLevels: empty.filter((e) => e < l && e >= from),
          reachedNobody: false,
        };
    }
    return {
      level: LAST_LEVEL,
      recipients: [],
      skipped: [],
      emptyLevels: empty.filter((e) => e >= from),
      reachedNobody: true,
    };
  };
const alert = (over: Partial<OpenAlert> = {}): OpenAlert => ({
  id: "a1",
  hospitalId: H_A,
  level: 0,
  dueAt: dueAtFor(0, T0, TIMES),
  ...over,
});

describe("escalation (ES)", () => {
  it("ES-1 due = sent + acknowledge-within; each level its own time; nothing signed, nothing automatic", () => {
    expect(dueAtFor(0, T0, TIMES)).toEqual(minutes(30));
    expect(dueAtFor(1, T0, TIMES)).toEqual(minutes(20));
    expect(dueAtFor(2, T0, TIMES)).toEqual(minutes(15));
    expect(dueAtFor(1, T0, { ...TIMES, level1AfterMin: null })).toBeNull();
    expect(dueAtFor(0, T0, null)).toBeNull();
    const unsigned = alert({ hospitalId: H_B, dueAt: null });
    expect(planEscalations(minutes(600), [unsigned], timesFor, ladder())).toEqual([]);
    // "Could not reach anyone" still escalates by hand.
    expect(escalateByHand(unsigned, minutes(5), null, ladder())).toMatchObject({
      toLevel: 1,
      dueAt: null,
      reason: "could_not_reach",
    });
  });

  it("ES-2 on time: nothing; late: one step; run twice for the same now: nothing new", () => {
    const a = alert();
    expect(planEscalations(minutes(29), [a], timesFor, ladder())).toEqual([]);
    const steps = planEscalations(minutes(30), [a], timesFor, ladder());
    expect(steps).toEqual([
      {
        alertId: "a1",
        fromLevel: 0,
        toLevel: 1,
        recipients: ["r1"],
        skipped: [],
        emptyLevels: [],
        dueAt: minutes(50),
        reason: "due",
      },
    ]);
    const after = applyStep(a, steps[0]!);
    expect(planEscalations(minutes(30), [after], timesFor, ladder())).toEqual([]);
    expect(applyStep(after, steps[0]!)).toEqual(after); // applying again is a no-op
  });

  it("ES-2 two levels in turn, then the last level holds", () => {
    let a = alert();
    a = applyStep(a, planEscalations(minutes(30), [a], timesFor, ladder())[0]!);
    expect(a).toMatchObject({ level: 1, dueAt: minutes(50) });
    a = applyStep(a, planEscalations(minutes(50), [a], timesFor, ladder())[0]!);
    expect(a).toMatchObject({ level: 2, dueAt: minutes(65) });
    expect(planEscalations(minutes(999), [a], timesFor, ladder())).toEqual([]);
  });

  it("ES-2 an empty level is passed at once and named", () => {
    const [s] = planEscalations(minutes(30), [alert()], timesFor, ladder([1]));
    expect(s).toMatchObject({ toLevel: 2, emptyLevels: [1], recipients: ["r2"] });
    const [none] = planEscalations(minutes(30), [alert()], timesFor, ladder([1, 2]));
    expect(none).toMatchObject({ toLevel: 2, emptyLevels: [1, 2], recipients: [] });
  });

  it("ES-3 the planner is pure: the same inputs at the same fixed clock give the same steps", () => {
    const run = () =>
      planEscalations(
        minutes(31),
        [alert(), alert({ id: "a2", level: 1, dueAt: minutes(10) })],
        timesFor,
        ladder(),
      );
    expect(run()).toEqual(run());
  });

  it("ES-4 at the last level the alert stays open and is listed overdue once its time passes", () => {
    const last = alert({ level: 2, dueAt: minutes(15) });
    expect(escalateByHand(last, minutes(1), TIMES, ladder())).toBeNull();
    expect(overdueAtLastLevel(last, minutes(14))).toBe(false);
    expect(overdueAtLastLevel(last, minutes(15))).toBe(true);
  });

  it("ES-5 the heartbeat is stale past three minutes, or when no run is recorded", () => {
    expect(heartbeatStale(null, T0)).toBe(true);
    expect(heartbeatStale(minutes(-3), T0)).toBe(false);
    expect(heartbeatStale(new Date(T0.getTime() - 180_001), T0)).toBe(true);
  });
});

describe("CA-14 property tests (seeded, no new dependency)", () => {
  const RUNS = 300;

  it("random event sequences never leave CA-2's states, and acknowledgement is first-wins", () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const r = prng(seed);
      const evs: AlertEvent[] = [
        {
          kind: "created",
          at: T0,
          level: 0,
          subState: r.pick(["sent", "not_sent"] as const),
          dueAt: minutes(30),
        },
      ];
      for (let i = 0; i < 30; i++) {
        const t = minutes(i + 1);
        const who = r.pick(["dr-1", "dr-2", "dr-3"]);
        const e = r.pick<AlertEvent>([
          { kind: "seen", at: t, recipientId: who },
          {
            kind: "notified",
            at: t,
            level: 0,
            recipientId: who,
            channel: "app",
            outcome: "queued",
          },
          { kind: "call_logged", at: t, actorId: "tech", to: who, readBack: false },
          { kind: "could_not_reach", at: t, actorId: "tech" },
          {
            kind: "escalated",
            at: t,
            level: r.pick([0, 1, 2] as const),
            dueAt: minutes(i + 20),
            recipients: [],
            emptyLevels: [],
          },
          {
            kind: "acknowledged",
            at: t,
            by: who,
            via: r.pick(["app", "phone"] as const),
            loggedBy: r.pick(["tech", null]),
            response: null,
          },
          { kind: "disputed", at: t, by: who, dueAt: minutes(i + 10) },
          { kind: "corrected", at: t, correctionAlertId: "c" },
        ]);
        evs.push(e);
      }
      // Replay step by step; check the shape at every prefix.
      let s = foldAlert(evs.slice(0, 1))!;
      for (const e of evs.slice(1)) {
        const prev = s;
        s = applyEvent(s, e);
        if (s.state === "open") {
          expect(["sent", "not_sent", "escalated"]).toContain(s.subState);
          expect(s.level).toBeGreaterThanOrEqual(prev.level); // levels never go down
        } else {
          expect(["app", "phone"]).toContain(s.via);
          if (s.via === "phone") expect(s.loggedBy).not.toBeNull();
          if (prev.state === "acknowledged") expect(s).toBe(prev); // first acknowledgement wins
        }
      }
      expect(foldAlert(evs)).toEqual(s);
    }
  });

  it("a simulated hospital: releases, acknowledgements and scheduler runs at random times keep every invariant", () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const r = prng(seed);
      const alerts: AlertRecord[] = [];
      const open = new Map<string, OpenAlert>();
      const marks: { alertId: string; reportId: string }[] = [];
      const released = new Set<string>();
      let now = T0;
      for (let tick = 0; tick < 40; tick++) {
        now = new Date(now.getTime() + r.int(15) * 60_000);
        const action = r.int(4);
        if (action === 0) {
          // Release a report with 0–3 marks: an alert only when marked (CA-1, CM-2).
          const reportId = `rep-${seed}-${tick}`;
          released.add(reportId);
          const n = r.int(4);
          if (n > 0) {
            const id = `al-${seed}-${tick}`;
            const due = dueAtFor(0, now, r.int(3) === 0 ? null : TIMES);
            alerts.push({
              id,
              reportId,
              events: [{ kind: "created", at: now, level: 0, subState: "sent", dueAt: due }],
            });
            open.set(id, { id, hospitalId: H_A, level: 0, dueAt: due });
            for (let k = 0; k < n; k++) marks.push({ alertId: id, reportId });
          }
        } else if (action === 1 && open.size > 0) {
          const id = r.pick([...open.keys()]);
          const a = alerts.find((x) => x.id === id)!;
          a.events.push({
            kind: "acknowledged",
            at: now,
            by: "dr-1",
            via: "app",
            loggedBy: null,
            response: null,
          });
          open.delete(id);
        } else {
          // A scheduler run (or the lazy path): plan, then apply each step.
          for (const s of planEscalations(
            now,
            [...open.values()],
            () => TIMES,
            ladder(r.int(2) ? [1] : []),
          )) {
            const a = alerts.find((x) => x.id === s.alertId)!;
            a.events.push({
              kind: "escalated",
              at: now,
              level: s.toLevel,
              dueAt: s.dueAt,
              recipients: s.recipients,
              emptyLevels: s.emptyLevels,
            });
            open.set(s.alertId, applyStep(open.get(s.alertId)!, s));
          }
          expect(planEscalations(now, [...open.values()], () => TIMES, ladder())).toEqual([]); // idempotent
        }
      }
      // Bring the record up to date, as every read does, then check CA-14.
      for (const s of planEscalations(now, [...open.values()], () => TIMES, ladder())) {
        alerts
          .find((x) => x.id === s.alertId)!
          .events.push({
            kind: "escalated",
            at: now,
            level: s.toLevel,
            dueAt: s.dueAt,
            recipients: [],
            emptyLevels: [],
          });
      }
      expect(alertInvariants({ alerts, marks, releasedReportIds: released, now })).toEqual([]);
    }
  });

  it("the invariant checker itself catches each broken invariant", () => {
    const ok: AlertRecord = {
      id: "a",
      reportId: "r",
      events: [{ kind: "created", at: T0, level: 0, subState: "sent", dueAt: minutes(1) }],
    };
    const broken = alertInvariants({
      alerts: [ok, { ...ok, id: "b" }, { id: "c", reportId: "unreleased", events: [] }],
      marks: [{ alertId: "zzz", reportId: "r" }],
      releasedReportIds: new Set(["r"]),
      now: minutes(5),
    });
    expect(broken).toEqual(
      expect.arrayContaining([
        "mark without alert: zzz",
        "alert without released report: c",
        "alert without created event: c",
        "overdue and not escalated: a",
        "2 alerts on one report: r",
      ]),
    );
  });
});
