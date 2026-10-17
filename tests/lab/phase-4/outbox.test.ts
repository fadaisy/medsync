import { describe, expect, it } from "vitest";

import {
  canAdvance,
  contentHash,
  nextAttempt,
  OUTBOX_NEXT,
  parseSenderTime,
  PROPOSED_RETRY,
  skew,
} from "@/lib/exchange/outbox";

/** Lab Phase 4 Step 3: the exchange's pure rules (EX-3, EX-4, EX-5, EX-8). Settings are operational. */
const now = new Date("2026-10-17T10:00:00Z");

describe("EX-3 content hash", () => {
  it("EX-3 the same bytes hash the same; one byte changes it", () => {
    expect(contentHash("MSH|^~\\&|TEST")).toBe(contentHash("MSH|^~\\&|TEST"));
    expect(contentHash("a")).not.toBe(contentHash("b"));
    expect(contentHash("")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("EX-4 retries, back-off and dead letters", () => {
  it("EX-4 back-off doubles from the base, capped, with jitter around it", () => {
    const at = (attempts: number, r = 0.5) => nextAttempt({ attempts, now, random: () => r });
    expect(at(1)).toEqual({ state: "retrying", nextAt: new Date(now.getTime() + 5_000) });
    expect(at(2)).toEqual({ state: "retrying", nextAt: new Date(now.getTime() + 10_000) });
    expect(at(30)).toEqual({ state: "retrying", nextAt: new Date(now.getTime() + 600_000) });
    const low = at(1, 0);
    const high = at(1, 1);
    expect(low.state === "retrying" && low.nextAt.getTime() - now.getTime()).toBe(4_000);
    expect(high.state === "retrying" && high.nextAt.getTime() - now.getTime()).toBe(6_000);
  });

  it("S31 EX-4 past the attempt limit the message is dead (and is never purged: no state leads out but a person)", () => {
    expect(nextAttempt({ attempts: PROPOSED_RETRY.limit, now })).toEqual({ state: "dead" });
    expect(OUTBOX_NEXT.dead).toEqual(["pending", "set_aside"]);
    expect(OUTBOX_NEXT.delivered).toEqual([]);
  });
});

describe("EX-5 inbound processing", () => {
  it("EX-5 received → parsed → matched → filed, or waiting for a match, or unreadable", () => {
    expect(canAdvance("received", "parsed")).toBe(true);
    expect(canAdvance("parsed", "waiting_match")).toBe(true);
    expect(canAdvance("waiting_match", "filed")).toBe(true);
    expect(canAdvance("received", "unreadable")).toBe(true);
    expect(canAdvance("received", "filed")).toBe(false);
    expect(canAdvance("filed", "parsed")).toBe(false);
  });
});

describe("EX-8 sender times and clock skew", () => {
  it("EX-8 ASTM time with no offset is read in the sender's zone (Kampala, UTC+3)", () => {
    expect(parseSenderTime("20261017130000", "Africa/Kampala")).toEqual({
      utc: new Date("2026-10-17T10:00:00Z"),
      zoneAssumed: "Africa/Kampala",
    });
  });

  it("EX-8 HL7 time with an offset keeps its offset; ISO with Z too", () => {
    expect(parseSenderTime("202610171300+0300", "UTC")).toEqual({
      utc: new Date("2026-10-17T10:00:00Z"),
      zoneAssumed: null,
    });
    expect(parseSenderTime("2026-10-17T10:00:00Z", "Africa/Kampala")).toEqual({
      utc: now,
      zoneAssumed: null,
    });
    expect(parseSenderTime("2026-10-17T13:00", "Africa/Kampala")).toEqual({
      utc: now,
      zoneAssumed: "Africa/Kampala",
    });
  });

  it("EX-8 unreadable or an unknown zone → null (the receipt time is used, marked)", () => {
    expect(parseSenderTime("yesterday", "Africa/Kampala")).toBeNull();
    expect(parseSenderTime("20261017130000", "Mars/Base")).toBeNull();
    expect(parseSenderTime("", "UTC")).toBeNull();
  });

  it("S49 EX-8 an analyser clock 4 minutes behind raises the note beyond a 2-minute threshold", () => {
    expect(skew(new Date(now.getTime() - 4 * 60_000), now, 2)).toEqual({
      minutes: 4,
      direction: "behind",
    });
    expect(skew(new Date(now.getTime() + 1 * 60_000), now, 2)).toBeNull();
  });
});
