import type { WorklistPayload } from "@/app/lab/_components/worklist-screen";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Lab Phase 0, Step 4 — the screens rendered to markup: the worklist (§5.3, LW-8, LW-11, §10), the
 * turnaround cell (§5.4, Law 5, Law 7) and the notice (§5.6, CF-2). Next's router and the server
 * action are stubbed; everything else is the shipped component.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/lab",
}));
vi.mock("@/lib/emr/actions/orders", () => ({ receiveSpecimen: async () => ({ ok: true }) }));

const { WorklistScreen } = await import("@/app/lab/_components/worklist-screen");
const { TurnaroundCell, ReleasedTurnaroundCell } =
  await import("@/app/lab/_components/turnaround-cell");
const { FlaggingNotice } = await import("@/app/lab/_components/flagging-notice");
const { LAB_PERMISSIONS } = await import("@/lib/lab/access");

const NOW = "2026-10-10T07:42:00.000Z"; // 10:42 in Kampala
const iso = (hhmm: string) => new Date(`2026-10-10T${hhmm}:00+03:00`).toISOString();
const CHEM = "sec-chem";
let n = 0;
const input = (
  o: Partial<WorklistPayload["inputs"][number]>,
): WorklistPayload["inputs"][number] => {
  n += 1;
  return {
    orderId: `o${n}`,
    hospitalId: "h1",
    patientUserId: `p${n}`,
    testId: null,
    test: `Test ${n}`,
    priority: "routine",
    stage: "to_result",
    specimenId: `s${n}`,
    reportId: null,
    collectedAt: iso("10:00"),
    receivedAt: iso("10:18"),
    from: { id: "d4a", name: "Ward 4A" },
    offeringSectionId: null,
    catalogueSectionId: null,
    statedTat: null,
    catalogueTargetMinutes: null,
    ...o,
  };
};

const payload = (o: Partial<WorklistPayload> = {}): WorklistPayload => {
  const inputs = [
    input({
      test: "Glucose",
      priority: "immediate",
      statedTat: "30 min",
      receivedAt: iso("10:36"),
      offeringSectionId: CHEM,
    }),
    input({
      test: "Urea and electrolytes",
      priority: "urgent",
      statedTat: "1 h",
      offeringSectionId: CHEM,
    }),
    input({
      test: "Liver function tests",
      statedTat: "2 h",
      receivedAt: iso("08:17"),
      offeringSectionId: CHEM,
    }),
    input({ test: "HbA1c", receivedAt: iso("10:02") }),
    input({ test: "Creatinine", stage: "to_receive", receivedAt: null, collectedAt: iso("10:07") }),
  ];
  return {
    hospitalName: "Test Hospital-1",
    inputs,
    identities: Object.fromEntries(
      inputs.map((i, k) => [
        i.patientUserId,
        { name: `Patient ${k + 1}`, mrn: `MS-2026-0000${k + 1}`, ageSex: "40 y · Female" },
      ]),
    ),
    restricted: [],
    highRisk: [],
    sections: [{ id: CHEM, name: "Clinical chemistry" }],
    viewer: { hospitalId: "h1", permissions: [...LAB_PERMISSIONS], sectionIds: [CHEM] },
    serverNowIso: NOW,
    timeZone: "Africa/Kampala",
    initial: { section: null, stage: null, dept: null, sort: null },
    ...o,
  };
};

const render = (p: WorklistPayload) => renderToStaticMarkup(h(WorklistScreen, { payload: p }));

describe("the worklist screen", () => {
  it("opens on the viewer's section with its count, All sections always beside it (LW-4, LW-6)", () => {
    const html = render(payload());
    expect(html).toMatch(/role="tablist" aria-label="Section"/);
    expect(html).toMatch(
      /aria-label="Clinical chemistry, 3"[^>]*aria-selected="true"|aria-selected="true"[^>]*aria-label="Clinical chemistry, 3"/,
    );
    expect(html).toMatch(/aria-label="All sections, 5"/);
    expect(html).toMatch(/aria-label="No section, 2"/);
    expect(html).toContain("3 of 5 specimens, in Clinical chemistry.");
    expect(html).toContain("The clock starts when the lab receives the specimen.");
  });

  it("§5.5: a flagged row carries the amber High-risk specimen tag in words; others none", () => {
    const p = payload({ initial: { section: "all", stage: null, dept: null, sort: null } });
    expect(render(p)).not.toContain("High-risk specimen");
    const html = render({ ...p, highRisk: [p.inputs[0]!.orderId] });
    expect(html).toMatch(/data-tone="caution"[^>]*>(<svg[\s\S]*?<\/svg>)?High-risk specimen/);
  });

  it("shows the Late chip in words, targets from data, and 'no target set' without colour (§5.4)", () => {
    const html = render(
      payload({ initial: { section: "all", stage: null, dept: null, sort: null } }),
    );
    expect(html).toContain("Late by 25 min");
    expect(html).toContain("target 2 h");
    expect(html).toContain("24 min · target 1 h");
    expect(html).toContain("40 min · no target set");
    expect(html).toContain("Collected 35 min ago · not received");
  });

  it("LW-11: both identifiers on every row; the one action is named with patient and test (§10)", () => {
    const html = render(
      payload({ initial: { section: "all", stage: null, dept: null, sort: null } }),
    );
    for (let k = 1; k <= 5; k += 1) {
      expect(html).toContain(`Patient ${k}`);
      expect(html).toContain(`MS-2026-0000${k}`);
    }
    const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]!.split(" "));
    expect(labelled.length).toBeGreaterThan(0);
    for (const ids of labelled) {
      expect(ids).toHaveLength(3);
      for (const id of ids) expect(html).toContain(`id="${id}"`);
    }
  });

  it("one primary button — the top row's; the rest secondary; Receive, Enter results by stage", () => {
    const html = render(
      payload({ initial: { section: "all", stage: null, dept: null, sort: null } }),
    );
    const desktop = html.slice(0, html.indexOf("md:hidden"));
    expect((desktop.match(/bg-primary text-primary-foreground/g) ?? []).length).toBe(1);
    expect(html).toContain(">Receive<");
    expect(html).toContain(">Enter results<");
  });

  it("LW-8: without the permission a row shows no button, and nothing disabled", () => {
    const html = render(
      payload({
        initial: { section: "all", stage: null, dept: null, sort: null },
        viewer: { hospitalId: "h1", permissions: ["lab.view"], sectionIds: [] },
      }),
    );
    expect(html).not.toContain(">Receive<");
    expect(html).not.toContain(">Enter results<");
  });

  it("says when the viewer has no section, and when nothing waits", () => {
    expect(
      render(
        payload({
          viewer: { hospitalId: "h1", permissions: [...LAB_PERMISSIONS], sectionIds: [] },
        }),
      ),
    ).toContain("You are not assigned to a lab section, so this shows all sections.");
    expect(render(payload({ inputs: [] }))).toContain("No specimens are waiting.");
  });

  it("the Updated stamp is the server's time at the hospital, not the device's", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(new Date(NOW).getTime() + 3 * 3600_000));
    expect(render(payload())).toMatch(/Updated <span[^>]*>10:42<\/span>/);
    vi.useRealTimers();
  });

  it("adds no red and no green", () => {
    const html = render(
      payload({ initial: { section: "all", stage: null, dept: null, sort: null } }),
    );
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
