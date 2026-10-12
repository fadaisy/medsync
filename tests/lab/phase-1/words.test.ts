import type { CellInput } from "@/lib/lab/criticals/words";
import { describe, expect, it } from "vitest";

import { ago, alertCell, alertTitles } from "@/lib/lab/criticals/words";

const T0 = new Date("2026-10-11T08:00:00Z");
const at = (m: number) => new Date(T0.getTime() + m * 60_000);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
/** Fixture response times, invented. */
const TIMES = { ackWithinMin: 30, level1AfterMin: 20, level2AfterMin: 15 };
const base: CellInput = {
  state: "open",
  subState: "sent",
  sentAt: T0,
  escalatedAt: null,
  acknowledgedAt: null,
  acknowledgedVia: null,
  acknowledgedByCadre: null,
  loggedByCadre: null,
  deliveryFailed: false,
};

describe("the Alert cell (§5.3), three words never blurred (Law 2)", () => {
  it("sent and waiting is neutral; past half the signed time it is amber, in words", () => {
    expect(alertCell(base, at(3), TIMES, hhmm)).toEqual({
      text: "Sent · waiting 3 min",
      tone: "neutral",
    });
    expect(alertCell(base, at(15), TIMES, hhmm)).toEqual({
      text: "Not acknowledged · 15 min",
      tone: "caution",
    });
    expect(alertCell(base, at(45), null, hhmm)).toEqual({
      text: "Sent · waiting 45 min",
      tone: "neutral",
    });
  });
  it("escalated, not sent and a failed delivery are amber", () => {
    expect(
      alertCell({ ...base, subState: "escalated", escalatedAt: at(30) }, at(31), TIMES, hhmm),
    ).toEqual({
      text: "Escalated 08:30 · waiting",
      tone: "caution",
    });
    expect(alertCell({ ...base, subState: "not_sent" }, at(1), TIMES, hhmm).text).toBe(
      "Not sent · phone the ward",
    );
    expect(alertCell({ ...base, deliveryFailed: true }, at(1), TIMES, hhmm).tone).toBe("caution");
  });
  it("acknowledged in the app or by phone is neutral and names the cadre", () => {
    const ack = { ...base, state: "acknowledged" as const, subState: null, acknowledgedAt: at(10) };
    expect(
      alertCell(
        { ...ack, acknowledgedVia: "app", acknowledgedByCadre: "Medical Officer" },
        at(11),
        TIMES,
        hhmm,
      ),
    ).toEqual({
      text: "Acknowledged 08:10 by Medical Officer",
      tone: "neutral",
    });
    expect(
      alertCell(
        { ...ack, acknowledgedVia: "phone", loggedByCadre: "Laboratory Technologist" },
        at(11),
        TIMES,
        hhmm,
      ).text,
    ).toBe("Acknowledged by phone 08:10 · logged by Laboratory Technologist");
  });
  it("seen never appears: there is no input for it", () => {
    expect(Object.keys(base)).not.toContain("seen");
  });
});

describe("the alert title (Appendix A)", () => {
  it("names the value, unit and direction; without a direction it says no more than it knows", () => {
    expect(
      alertTitles({
        marked: [{ display: "Glucose", value: "1.9", unit: "mmol/L", direction: "low" }],
      }),
    ).toEqual(["Critical result: Glucose 1.9 mmol/L, low."]);
    expect(
      alertTitles({
        marked: [{ display: "Potassium", value: "6.9", unit: "mmol/L", direction: null }],
      }),
    ).toEqual(["Critical result: Potassium 6.9 mmol/L."]);
  });
  it("ago", () => {
    expect(ago(T0, at(0))).toBe("just now");
    expect(ago(T0, at(4))).toBe("4 min ago");
    expect(ago(T0, at(65))).toBe("1 h 5 min ago");
  });
});

describe("the escalated line (Appendix A)", () => {
  it("names whoever had the alert before it came here, even across an empty level", async () => {
    const { missedBy } = await import("@/lib/lab/criticals/words");
    expect(missedBy({ escalatedFrom: 0, level: 2, place: "Diabetes clinic" })).toBe(
      "the ordering team, Diabetes clinic",
    );
    expect(missedBy({ escalatedFrom: 1, level: 2, place: "Ward 4A" })).toBe(
      "Ward 4A's critical-results contacts",
    );
    expect(missedBy({ escalatedFrom: null, level: 1, place: null })).toBe(
      "the ordering team, the ward",
    );
  });
});

describe("the correction title (CA-10, Appendix A)", () => {
  it("says the old and the new value", () => {
    expect(
      alertTitles({
        marked: [
          { display: "Potassium", value: "4.9", unit: "mmol/L", direction: null, was: "6.9" },
        ],
      }),
    ).toEqual(["Corrected result: Potassium was 6.9, is now 4.9 mmol/L."]);
  });
});
