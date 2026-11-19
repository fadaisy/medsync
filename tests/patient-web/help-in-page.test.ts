/**
 * ADR 0528 on the web (the phone's twin is mobile/src/features/safety/help-in-page.test.tsx): the header Help
 * steps aside only while the danger step on screen draws its own red Help as its main action, and returns on
 * the recheck.
 */
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { DangerInterrupt } from "@/components/tide/reading-check";
import { DangerFlowWeb } from "@/components/tide/v2-care-web";
import { READINGS_COPY } from "@/content/patient/readings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/pw/patient/care/readings",
}));

function mount(el: ReturnType<typeof h>) {
  const dom = new JSDOM("<!doctype html><body><div id=r></div></body>");
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.self = dom.window;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const host = dom.window.document.getElementById("r")!;
  const root = createRoot(host);
  act(() => root.render(el));
  const click = (node: Element) =>
    act(() => {
      node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
  return { host, root, click };
}

const D = READINGS_COPY.danger;

describe("ADR 0528: the danger interrupt", () => {
  it("asks with its own red Help as the main action, then gives the header Help back on the recheck", () => {
    const told: boolean[] = [];
    const { host, root, click } = mount(
      h(DangerInterrupt, {
        input: { kind: "bp", top: 70, bottom: 40 },
        onHelpInPage: (b) => told.push(b),
      }),
    );
    expect(told.at(-1)).toBe(true);
    const help = [...host.querySelectorAll("a")].find((a) => a.textContent === D.yesHelp)!;
    expect(help.getAttribute("href")).toBe("/emergency");
    // It draws no second Help of its own: the page's header Help is the only other one.
    expect([...host.querySelectorAll("a[data-emergency-inline]")]).toHaveLength(0);

    click([...host.querySelectorAll("button")].find((b) => b.textContent === D.noFine)!);
    expect(told.at(-1)).toBe(false);
    act(() => root.unmount());
  });
});

describe("ADR 0528: the care-mode danger flow", () => {
  const save = async () => ({});

  it("a flow that goes straight to Help reports it", () => {
    const told: boolean[] = [];
    const { host, root } = mount(
      h(DangerFlowWeb, { kind: "low_bp", saveReading: save, onHelpInPage: (b) => told.push(b) }),
    );
    expect(told.at(-1)).toBe(true);
    expect(host.querySelector('a[href="/patient/help"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("a self-care step keeps the header Help", () => {
    const told: boolean[] = [];
    const { root } = mount(
      h(DangerFlowWeb, { kind: "low_sugar", saveReading: save, onHelpInPage: (b) => told.push(b) }),
    );
    expect(told.at(-1)).toBe(false);
    act(() => root.unmount());
  });
});
