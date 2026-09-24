import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PendingEntry } from "@/app/nurse/resus/[episodeId]/_components/v2/types";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  activeView,
  backoffMs,
  landedEntries,
  nextToSend,
  toOutcome,
  withTimeout,
} from "@/app/nurse/resus/[episodeId]/_components/v2/desk-queue-model";

/**
 * Resus Desk v2 — the shell fixes to the write queue (PURE parts of
 * use-desk-queue.ts), plus two source-level guards for the floating Emergency
 * pill and bedside time.
 */

const row = (id: string, kind: TimelineEvent["kind"], clientEventId: string): TimelineEvent => ({
  id,
  episodeId: "ep",
  kind,
  step: null,
  recordedByUserId: "u",
  recordedAt: "2026-09-24T10:00:00.000Z",
  createdAt: "2026-09-24T10:00:00.000Z",
  payload: {},
  supersedesEventId: null,
  clientEventId,
});

const entry = (id: string, status: PendingEntry["status"], kind: TimelineEvent["kind"]) =>
  ({
    clientEventId: id,
    label: id,
    status,
    attempts: 0,
    error: status === "failed" ? "refused" : null,
    optimistic: [row(`pending:${id}:0`, kind, id)],
    queuedAtMs: 0,
  }) satisfies PendingEntry;

describe("R1 — an accepted write carries the rows it created", () => {
  it("toOutcome keeps eventIds (an empty list means nothing to wait for)", () => {
    expect(toOutcome({ ok: true, eventIds: ["r1", "r2"] })).toEqual({
      ok: true,
      eventIds: ["r1", "r2"],
    });
    expect(toOutcome({ ok: true, eventIds: [] })).toEqual({ ok: true, eventIds: [] });
  });

  it("an entry settles when every row id the server returned is in the record", () => {
    const awaiting = new Map([["c1", ["r1", "r2"]]]);
    expect(landedEntries([], new Set(["r1"]), awaiting).has("c1")).toBe(false);
    expect(landedEntries([], new Set(["r1", "r2"]), awaiting).has("c1")).toBe(true);
    expect(landedEntries([row("r9", "note", "c2")], new Set(), new Map()).has("c2")).toBe(true);
  });
});

describe("R3 / R8 — a refused write never drives decision support", () => {
  it("activeView leaves out a failed entry's rows, keeps pending and sending ones", () => {
    const view = activeView(
      [],
      [entry("a", "failed", "rosc"), entry("b", "pending", "shock"), entry("c", "sending", "drug")],
    );
    expect(view.map((e) => e.kind).sort()).toEqual(["drug", "shock"]);
  });
});

describe("R7 — backoff holds the head even when new taps arrive", () => {
  it("nextToSend returns nothing while the head waits, then the head (never the one behind it)", () => {
    const q = [entry("head", "pending", "note"), entry("tap", "pending", "note")];
    const notBefore = new Map([["head", 5_000]]);
    expect(nextToSend(q, notBefore, 4_999)).toBeNull();
    expect(nextToSend(q, notBefore, 5_000)?.clientEventId).toBe("head");
    expect(nextToSend([entry("x", "failed", "note")], new Map(), 0)).toBeNull();
  });

  it("backoff runs 1-2-4-8 then caps at 10 s", () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000]);
  });
});

describe("R5 — a write that never answers becomes a retry", () => {
  it("withTimeout resolves to a retryable outcome", async () => {
    const hung = new Promise<never>(() => undefined);
    const o = await withTimeout(hung, 5);
    expect(o).toMatchObject({ ok: false, retry: true });
    if (!o.ok) expect(o.error).toMatch(/will retry/i);
  });

  it("a prompt answer wins the race", async () => {
    expect(await withTimeout(Promise.resolve({ ok: true }), 1_000)).toEqual({ ok: true });
  });
});

describe("source guards", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  const v2 = "app/nurse/resus/[episodeId]/_components/v2";

  it("S4 — the pill stands down only beside an inline Emergency link; no style hack on the desk", () => {
    expect(read("components/emergency/emergency-pill.tsx")).toMatch(
      /\[body:has\(\[data-emergency-inline\]\)_&\]:hidden/,
    );
    expect(read(`${v2}/header.tsx`)).toMatch(
      /href="\/emergency"[\s\S]{0,200}data-emergency-inline/,
    );
    expect(read(`${v2}/desk.tsx`)).not.toMatch(/nav\[aria-label="Emergency"\]/);
  });

  it("S6 — Law 6: the step rail's Return to A sends the bedside time", () => {
    expect(read(`${v2}/step-rail.tsx`)).toMatch(/recordReturnToAV2\(\{[^}]*recordedAt/);
  });
});
