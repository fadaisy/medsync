import type * as Common from "@/app/nurse/resus/_v2/common";
import type { TimelineEvent } from "@/lib/resus/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_CONTEXT } from "@/lib/resus/model";

/**
 * Resus Desk v2 survey actions — server fixes (no DB: the prelude and the
 * write core are stubbed). SV-CTX-01: a context tap is a patch merged over
 * the record's latest context, so two devices flipping different flags both
 * land. R2: vitals the capture form refuses are refused by the server too.
 */

vi.mock("@/lib/resus/scope", () => ({ requireResusScope: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
const commit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/resus/v2-record", () => ({
  commitResusEvents: commit,
  fetchAllResusEvents: vi.fn(async () => []),
  fetchResusEventsSince: vi.fn(async () => []),
}));
vi.mock("@/app/nurse/resus/_v2/common", async (importOriginal) => {
  const real = await importOriginal<typeof Common>();
  return { ...real, prelude: vi.fn(real.prelude) };
});

const common = await import("@/app/nurse/resus/_v2/common");
const { logVitalsV2, setPatientContextV2 } = await import("@/app/nurse/resus/_v2/actions-survey");

const EPISODE = "5b0c3f5e-3c1a-4b8e-9d2a-1f6e2c7a9b10";
const AT = "2026-09-24T07:10:00.000Z";
const id = () => crypto.randomUUID();

function preludeWith(events: TimelineEvent[]) {
  vi.mocked(common.prelude).mockResolvedValueOnce({
    ok: true,
    scope: { userId: "u-1", hospitalId: "h-1", departmentId: "d-1" } as never,
    header: { id: EPISODE, state: "active", phase: "survey", patientUserId: null } as never,
    events,
    rows: events.length,
    replay: null,
  });
}

const contextRow = (flags: Record<string, unknown>): TimelineEvent => ({
  id: "ctx-1",
  episodeId: EPISODE,
  kind: "context",
  step: "pre",
  recordedByUserId: "u-2",
  recordedAt: "2026-09-24T07:00:00.000Z",
  createdAt: "2026-09-24T07:00:00.000Z",
  payload: { flags, label: "Context: trauma" },
  supersedesEventId: null,
});

beforeEach(() => {
  commit.mockReset();
  commit.mockResolvedValue({ ok: true, serverTime: AT, events: [{ eventId: "e-1" }] });
  vi.mocked(common.prelude).mockClear();
});

describe("SV-CTX-01 — a context tap merges over the latest context", () => {
  it("SV-CTX-01: another device's flag survives this device's patch", async () => {
    preludeWith([contextRow({ ...EMPTY_CONTEXT, trauma: true })]);
    // This device never saw "trauma": its full view is stale; the patch is what it changed.
    const r = await setPatientContextV2({
      episodeId: EPISODE,
      clientEventId: id(),
      recordedAt: AT,
      flags: { ...EMPTY_CONTEXT, chestTrauma: true },
      patch: { chestTrauma: true },
    });
    expect(r.ok).toBe(true);
    const payload = commit.mock.calls[0]![0].events[0].payload;
    expect(payload.flags).toMatchObject({ trauma: true, chestTrauma: true });
    expect(payload.patch).toEqual({ chestTrauma: true });
    expect(payload.label).toBe("Context: trauma, chestTrauma");
  });

  it("SV-CTX-01: without a patch the full flags are written as sent", async () => {
    preludeWith([contextRow({ ...EMPTY_CONTEXT, trauma: true })]);
    await setPatientContextV2({ episodeId: EPISODE, clientEventId: id(), flags: EMPTY_CONTEXT });
    const payload = commit.mock.calls[0]![0].events[0].payload;
    expect(payload.flags).toEqual(EMPTY_CONTEXT);
    expect(payload).not.toHaveProperty("patch");
  });
});

describe("R2 — the server refuses impossible vitals", () => {
  it.each([{ spo2: 970 }, { temperature: 375 }, { glucose: 600 }, { hr: -1 }])(
    "R2: %o is refused before anything is read or written",
    async (snapshot) => {
      const r = await logVitalsV2({ episodeId: EPISODE, clientEventId: id(), snapshot });
      expect(r).toEqual({ ok: false, error: "Invalid vitals." });
      expect(common.prelude).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    },
  );
});
