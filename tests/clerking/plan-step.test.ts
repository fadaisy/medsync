// @vitest-environment jsdom
import type { PlacePlanRequest } from "@/components/clerking/plan/plan-step";
import type { DeskPayload } from "@/components/emr/desk/model";
import type { PlanDraft } from "@/lib/clerking/plan/draft";
import type { NoteContent } from "@/lib/emr/note-rules";
import { act, createElement as h, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncRecorded } from "@/components/emr/desk/model";
import {
  DX_CATALOGUE,
  DX_NAMES,
  DX_SIGNOFF,
  DX_TERM_IDS,
  TEST_NAMES,
  TEST_SPECIMENS,
  TEST_UUIDS,
} from "@/lib/clerking/impression/load";
import { ecat } from "./exam-fixtures";
import { cat, v2Payload } from "./fixtures";
import { PLAN_DX, withPlanFixture } from "./plan-fixtures";

/**
 * Step 10 Plan by problem in the v2 desk (ADR 0184): the four questions in order, a test to the
 * basket with its priority, frequency and problem, Emergency the one red with its word, one Place
 * action, Mark plan done waiting for the checklist and then signing, and the prescribing dialog's
 * chips announced as pressed with the disabled reason in words. Synthetic patient only.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ClerkingDesk } = await import("@/components/clerking/clerking-desk");

const dx = {
  cat: DX_CATALOGUE,
  termIds: DX_TERM_IDS,
  names: DX_NAMES,
  tests: TEST_NAMES,
  testIds: TEST_UUIDS,
  specimens: TEST_SPECIMENS,
};

function payload(plan = true): DeskPayload {
  const p = v2Payload();
  p.clerking!.dx = {
    catalogueUrl: "/api/clerking/dx-catalogue?v=test",
    catalogueVersion: DX_CATALOGUE.version,
    signoff: DX_SIGNOFF,
  };
  const out = withPlanFixture(p);
  if (!plan) delete out.plan;
  return out;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let latest: NoteContent;
let placed: PlacePlanRequest[] = [];

function Harness({ p }: { p: DeskPayload }) {
  const [content, setContent] = useState(p.draft!.content);
  const [plan, setPlan] = useState(p.plan);
  const now = useMemo(() => ({ ...p, ...(plan ? { plan } : {}) }), [p, plan]);
  const shown = useMemo(() => syncRecorded(content, now), [content, now]);
  let seq = 0;
  const on = {
    onContent: (c: NoteContent) => setContent(() => (latest = c)),
    onSection() {},
    onPlacePlan: async (r: PlacePlanRequest) => {
      placed.push(r);
      setPlan((x) =>
        x
          ? {
              ...x,
              record: {
                ...x.record,
                orders: [
                  ...x.record.orders,
                  ...r.orders.map((o) => ({
                    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "9")}`,
                    display: o.display,
                    testKey: o.testKey,
                    testId: o.testId,
                    priority: o.priority,
                    frequency: o.frequency,
                    reasonConditionIds: o.reasonConditionIds,
                    at: "2026-09-27T20:16:00.000Z",
                    statusText: "To collect",
                    open: true,
                  })),
                ],
              },
            }
          : x,
      );
      return true;
    },
    onSyncCharts: async () => true,
    onMedicine: (id: string, answer: "continued" | "stopped" | "changed" | "held") =>
      setPlan((x) =>
        x
          ? {
              ...x,
              record: {
                ...x.record,
                medicines: x.record.medicines.map((m) => (m.id === id ? { ...m, answer } : m)),
              },
            }
          : x,
      ),
  };
  return h(ClerkingDesk, {
    p: now,
    cat,
    ecat,
    dx,
    content: shown,
    current: "plan",
    save: { tone: "neutral", text: "Saved 08:19" },
    actor: "u-1",
    on,
    loaders: { findings: async () => [], terms: async () => [] },
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(q);
    return {
      matches: min ? 1440 >= +min[1]! : max ? 1440 <= +max[1]! : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    };
  }) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  placed = [];
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (p: DeskPayload) => act(() => root.render(h(Harness, { p })));
const tap = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to tap");
  act(() => (el as HTMLElement).click());
};
const buttons = (name: string | RegExp, within: ParentNode = document) =>
  [...within.querySelectorAll("button")].filter((b) =>
    typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? ""),
  );
const button = (name: string | RegExp, within: ParentNode = document) => buttons(name, within)[0];
const radio = (group: string, name: string) =>
  [
    ...(document
      .querySelector(`[role="radiogroup"][aria-label="${group}"]`)
      ?.querySelectorAll('[role="radio"]') ?? []),
  ].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
const type = (el: Element | null | undefined, value: string) =>
  act(() => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const plan = () => (latest.plan ?? {}) as PlanDraft;
const headings = () => [...host.querySelectorAll("h3")].map((x) => x.textContent?.trim());

describe("step 10, Plan by problem", () => {
  it("asks the four questions in order, with the problems in Impression order", async () => {
    mount(payload());
    await act(async () => {});
    const hs = headings();
    const order = [
      "Where, and how closely",
      "By problem",
      "Medicines",
      "Monitoring charts",
      "Talked through",
      "Before you sign",
    ];
    expect(order.map((x) => hs.indexOf(x))).toEqual(
      [...order.map((x) => hs.indexOf(x))].sort((a, b) => a - b),
    );
    expect(order.every((x) => hs.includes(x))).toBe(true);
    const cards = [...host.querySelectorAll("h4 button")].map(
      (b) => b.querySelector(".sr-only")?.textContent,
    );
    expect(cards).toEqual([
      "Leading. Sepsis",
      "1. Bacterial meningitis",
      "Hypothermia, cause not yet known",
    ]);
    expect(host.textContent).toMatch(/to do before signing/);
    expect(host.textContent).toMatch(/Draft map, not CSO-signed/);
    expect(host.textContent).toMatch(/No signed care items for this problem yet/);
  });

  it("a test goes to the basket with its priority, frequency and problem; nothing is sent until placed", async () => {
    mount(payload());
    await act(async () => {});
    const emergency = radio("Priority, Blood culture", "Emergency")!;
    tap(emergency);
    expect(emergency.getAttribute("aria-checked")).toBe("true");
    // The one red in the Plan, with its word.
    expect(emergency.className).toMatch(/bg-status-critical-bg/);
    expect(radio("Priority, Lactate", "Routine")!.className).not.toMatch(/critical/);
    tap(radio("Priority, Lactate", "Routine"));
    tap(radio("How often, Lactate", "6-hourly"));
    const adds = buttons("Add", host);
    tap(adds[0]);
    tap(adds[1]);
    expect(plan().basket!.orders).toMatchObject([
      {
        testKey: "test.blood_culture",
        priority: "emergency",
        frequency: null,
        reasonConditionIds: [PLAN_DX[0]!.id],
      },
      {
        testKey: "test.lactate",
        priority: "routine",
        frequency: "6h",
        reasonConditionIds: [PLAN_DX[0]!.id],
      },
    ]);
    expect(placed).toEqual([]);
    const place = button(/^Place 2 orders and 0 prescriptions$/)!;
    await act(async () => {
      (place as HTMLElement).click();
    });
    expect(placed).toHaveLength(1);
    expect(placed[0]!.orders.map((o) => o.testKey)).toEqual(["test.blood_culture", "test.lactate"]);
    expect(plan().basket).toEqual({ orders: [], prescriptions: [] });
    expect(host.textContent).toMatch(/Placed \d\d:\d\d/);
  });

  it("Mark plan done waits for the checklist; then the plan is done and signing may go ahead", async () => {
    mount(payload());
    await act(async () => {});
    const markDone = () => button(/^(Mark plan done|Plan done)$/)! as HTMLButtonElement;
    expect(markDone().disabled).toBe(true);
    tap(radio("Disposition", "Observe in EU"));
    tap(radio("Observations", "Hourly"));
    tap(radio("Senior review", "Within 1 hour"));
    tap(buttons("Add", host)[0]);
    await act(async () => {
      button(/^Place 1 order and 0 prescriptions$/)!.click();
    });
    // Bacterial meningitis is a must-not-miss (its card opens by itself): a reason of three words.
    const box = [...host.querySelectorAll("label")].find((l) =>
      /^Must not miss/.test(l.textContent ?? ""),
    )!;
    type(document.getElementById(box.htmlFor), "no neck stiffness, alert");
    tap(radio("Decision for Metformin", "Continue"));
    expect(markDone().disabled).toBe(false);
    expect(host.textContent).toMatch(/Ready to mark done/);
    await act(async () => markDone().click());
    expect(plan().done).toMatchObject({ by: "u-1" });
    expect(host.textContent).toMatch(/Plan done/);
    // A later change reopens it.
    tap(radio("Senior review", "Now"));
    expect(host.textContent).toMatch(/Ready to mark done/);
  });

  it("the prescribing dialog: chips announce pressed, the disabled reason is in words", async () => {
    mount(payload());
    await act(async () => {});
    tap(button("Ceftriaxone", host));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toMatch(/Prescribe · for Sepsis/);
    expect(dialog.textContent).toMatch(/No verified regimen yet: type the dose/);
    expect(dialog.textContent).toMatch(/Choose the route\./);
    const iv = [...dialog.querySelectorAll('[aria-label="Route"] button')].find(
      (b) => b.textContent?.trim() === "IV",
    )!;
    expect(iv.getAttribute("aria-pressed")).toBe("false");
    tap(iv);
    expect(iv.getAttribute("aria-pressed")).toBe("true");
    expect(dialog.textContent).toMatch(/Type the dose\./);
    type(dialog.querySelector("input[inputmode=decimal]"), "2");
    tap(
      [...dialog.querySelectorAll('[aria-label="Unit"] button')].find(
        (b) => b.textContent?.trim() === "g",
      ),
    );
    tap(
      [...dialog.querySelectorAll('[aria-label="How often"] button')].find(
        (b) => b.textContent?.trim() === "Once daily",
      ),
    );
    // No blood culture ordered for a sepsis-type problem: an answer is needed before adding.
    expect(dialog.textContent).toMatch(/Answer "Cultures before antibiotics" to continue\./);
    const add = button("Add to basket", dialog) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    tap(
      [...dialog.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Aware; will monitor",
      ),
    );
    expect(add.disabled).toBe(false);
    tap(add);
    expect(plan().basket!.prescriptions).toMatchObject([
      {
        drugId: "ceftriaxone",
        doseNum: 2,
        unit: "g",
        route: "iv",
        frequency: "daily",
        conditionId: PLAN_DX[0]!.id,
      },
    ]);
  });

  it("Show all medicines: every class by body system; choosing one prescribes it", async () => {
    mount(payload());
    await act(async () => {});
    tap(button("Ceftriaxone", host));
    const rx = document.querySelector('[role="dialog"]')!;
    const showAll = [...rx.querySelectorAll("button")].find(
      (b) => b.textContent === "Show all medicines",
    )!;
    expect(showAll.getAttribute("aria-haspopup")).toBe("dialog");
    tap(showAll);
    const all = [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      /All medicines/.test(d.textContent ?? ""),
    )!;
    expect(all).toBeTruthy();
    expect(all.textContent).toMatch(/182 medicines in \d+ classes, by body system/);
    const systems = [...all.querySelectorAll("h3")].map((x) => x.firstChild?.textContent);
    expect(systems[0]).toBe("Anti-infectives");
    expect(systems).toContain("Cardiovascular");
    const classes = [...all.querySelectorAll("h4")].map((x) => x.firstChild?.textContent);
    expect(classes).toContain("Penicillins");
    expect(classes).toContain("Cephalosporins, third generation");
    // The medicine the dialog is on is ticked.
    const ceftriaxone = [...all.querySelectorAll("button[aria-pressed]")].find((b) =>
      /^Ceftriaxone/.test(b.textContent ?? ""),
    )!;
    expect(ceftriaxone.getAttribute("aria-pressed")).toBe("true");
    // The filter narrows to the class typed, and says how many match.
    type(all.querySelector('input[placeholder^="Name, class"]'), "penicillin");
    const rows = [...all.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent);
    expect(rows.some((t) => /^Amoxicillin/.test(t ?? ""))).toBe(true);
    expect(rows.some((t) => /^Ceftriaxone/.test(t ?? ""))).toBe(false);
    expect(all.textContent).toMatch(/\d+ medicines match/);
    tap(
      [...all.querySelectorAll("button[aria-pressed]")].find((b) =>
        /^Amoxicillin(?!–)/.test(b.textContent ?? ""),
      ),
    );
    await act(async () => {});
    const open = [...document.querySelectorAll('[role="dialog"]')];
    expect(open.some((d) => /All medicines/.test(d.textContent ?? ""))).toBe(false);
    expect(open[0]!.textContent).toMatch(/Amoxicillin · Penicillins/);
  });

  it("off (no Plan payload), step 10 is the v1 Plan", async () => {
    mount(payload(false));
    await act(async () => {});
    expect(headings()).not.toContain("By problem");
  });
});
