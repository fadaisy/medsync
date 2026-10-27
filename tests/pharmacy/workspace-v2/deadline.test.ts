import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const { within } = await import("@/app/pharmacy/_lib/deadline");
const { logger } = await import("@/lib/logger");

describe("within", () => {
  it("passes a read that answers in time through unchanged", async () => {
    await expect(within(Promise.resolve(7), 1000, "x")).resolves.toBe(7);
  });

  it("rejects a read that never answers, and logs its name", async () => {
    vi.useFakeTimers();
    const p = within(new Promise(() => {}), 25_000, "needs_you.reconciliation");
    const done = expect(p).rejects.toThrow(/needs_you\.reconciliation timed out/);
    await vi.advanceTimersByTimeAsync(25_000);
    await done;
    expect(logger.warn).toHaveBeenCalledWith("pharmacy.read_timed_out", {
      what: "needs_you.reconciliation",
      ms: 25_000,
    });
    vi.useRealTimers();
  });

  it("keeps a read's own failure", async () => {
    await expect(within(Promise.reject(new Error("boom")), 1000, "x")).rejects.toThrow("boom");
  });
});
