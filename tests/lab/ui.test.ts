import type { QueueRow } from "@/app/lab/bench/_lib/bench";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Lab Phase 0, Step 4 — the screens rendered to markup: the bench queue (Lab Workspace v2; was the worklist), the
 * turnaround cell (§5.4, Law 5, Law 7) and the notice (§5.6, CF-2). Next's router and the server
 * action are stubbed; everything else is the shipped component.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/lab",
}));
vi.mock("@/lib/emr/actions/orders", () => ({ receiveSpecimen: async () => ({ ok: true }) }));
// Lab Phase 2 bench: the live line opens a Supabase channel and the actions are server-only.
vi.mock("@/components/lab/lab-live", () => ({ LabLive: () => null }));
vi.mock("@/lib/lab/bench-actions", () => ({
  receiveByLabelAction: async () => ({ ok: true }),
  undoReceiveAction: async () => ({ ok: true }),
  findSpecimenAction: async () => ({ ok: true, data: [] }),
}));

const { Queue } = await import("@/app/lab/bench/_components/queue");
const { TurnaroundCell, ReleasedTurnaroundCell } =
  await import("@/app/lab/_components/turnaround-cell");
const { FlaggingNotice } = await import("@/app/lab/_components/flagging-notice");

/**
 * Lab Workspace v2 (ADR 0343): the bench queue replaced the Phase 0 worklist table. It keeps LW-11 (both
 * identifiers on every row), "Late" amber in words only when the engine says late, pills as words, and no red
 * or green (Law 8).
 */
describe("the bench queue", () => {
  const row = (o: Partial<QueueRow>): QueueRow => ({
    orderId: "o1",
    specimenId: "s1",
    patientUserId: "p1",
    name: "Bosco Fixture",
    mrn: "MS-2026-00002",
    test: "Creatinine",
    from: "Ward 4A",
    stage: "to_result",
    waitingMinutes: 28,
    lateBy: null,
    received: true,
    pills: [],
    action: "enter",
    highRisk: false,
    ...o,
  });
  const render = (rows: QueueRow[]) =>
    renderToStaticMarkup(
      h(Queue, { rows, selected: "o2", query: "", procedure: null, label: "Queue" }),
    );

  it("LW-11: both identifiers on every row, never prefetched", () => {
    const html = render([
      row({}),
      row({ orderId: "o2", name: "Agnes Fixture", mrn: "MS-2026-00003" }),
    ]);
    for (const id of ["Bosco Fixture", "MS-2026-00002", "Agnes Fixture", "MS-2026-00003"])
      expect(html).toContain(id);
    expect(html).toMatch(/aria-current="true"/);
  });

  it("Late is amber with the clock and the words only when the engine says late", () => {
    expect(render([row({ lateBy: 25 })])).toMatch(/data-tone="caution"[^>]*>[\s\S]*Late 25 min/);
    const onTime = render([row({})]);
    expect(onTime).not.toMatch(/data-tone="caution"/);
    expect(onTime).toContain("28 min");
  });

  it("pills are words; a receive row asks for the procedure on a high-risk specimen", () => {
    const html = render([
      row({ pills: ["delta"] }),
      row({
        orderId: "o3",
        stage: "to_receive",
        action: "receive",
        received: false,
        highRisk: true,
        pills: ["highRisk"],
      }),
    ]);
    expect(html).toContain("Delta check");
    expect(html).toContain("Procedure followed");
    expect(html).toContain("Tick that the procedure was followed first.");
  });

  it("adds no red and no green", () => {
    const html = render([
      row({ lateBy: 5, pills: ["qcHold"] }),
      row({ orderId: "o4", pills: ["immediate"] }),
    ]);
    expect(html).not.toMatch(/status-critical|-red-\d|-green-\d|bg-destructive/);
  });
});

describe("the turnaround cell (Law 5, Law 7)", () => {
  const cell = (clock: Parameters<typeof TurnaroundCell>[0]["clock"]) =>
    renderToStaticMarkup(h(TurnaroundCell, { clock }));
  it("no target, no colour", () => {
    const html = cell({ kind: "running", elapsed: 40, target: null, lateBy: null });
    expect(html).toContain("40 min · no target set");
    expect(html).not.toMatch(/caution|amber/);
  });
  it("late: amber, a clock icon and the words", () => {
    const html = cell({
      kind: "running",
      elapsed: 145,
      target: { minutes: 120, source: "facility" },
      lateBy: 25,
    });
    expect(html).toMatch(/bg-status-caution-bg/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain("Late by 25 min");
  });
  it("a catalogue target says default", () => {
    expect(
      cell({
        kind: "running",
        elapsed: 10,
        target: { minutes: 60, source: "catalogue" },
        lateBy: null,
      }),
    ).toContain("10 min · target 1 h default");
  });
  it("released turnaround", () => {
    const html = renderToStaticMarkup(
      h(ReleasedTurnaroundCell, {
        turnaround: { minutes: 52, lateBy: null },
        target: { minutes: 60, source: "facility" },
      }),
    );
    expect(html).toContain("52 min · target 1 h");
  });
});

describe("the critical-flagging notice (CF-2)", () => {
  it("is standing status information with the Appendix B words and no close button", () => {
    const html = renderToStaticMarkup(h(FlaggingNotice));
    expect(html).toMatch(/role="status"/);
    expect(html).toContain("<strong");
    expect(html).toContain("Automatic critical flagging is off.");
    expect(html).toContain("phone critical results to the ward");
    expect(html).not.toMatch(/<button|aria-label="(Close|Dismiss)/i);
    expect(html).not.toMatch(/role="alert"/);
  });
});
