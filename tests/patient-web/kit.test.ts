import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { Button, Card, EmptyState, Note, Pill, StatusPill } from "@/components/tide/kit";
import { PageHeader, PatientShell } from "@/components/tide/shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/pw/patient/care" }));

/** S1 and S3 (PROMPT-PATIENT-WEB-TIDE Step 2): the kit and the shell, rendered, with axe. Layout and colour
 *  rules come back "incomplete" in jsdom; the harness checks them in a real browser at 1440 and 390. */
async function axeOf(html: string) {
  const dom = new JSDOM(
    `<!doctype html><html lang="en"><head><title>t</title></head><body>${html}</body></html>`,
    { runScripts: "outside-only" },
  );
  dom.window.eval(axe.source);
  const run = (dom.window as unknown as { axe: typeof axe }).axe.run(dom.window.document, {
    resultTypes: ["violations"],
  });
  return { dom, results: await run };
}

const page = (light?: boolean, bare?: boolean) =>
  renderToStaticMarkup(
    h(PatientShell, {
      dosesDue: 2,
      light,
      bare,
      plus: h("button", { type: "button", "aria-label": "Add" }, "+"),
      children: [
        h(PageHeader, {
          key: "h",
          title: "Care",
          overline: "Care",
          area: "medicines",
          unseen: 3,
          demo: true,
        }),
        h(Card, {
          key: "c",
          children: [
            h(Button, { key: 1, disabledReason: "Choose a day first.", children: "Book" }),
            h(StatusPill, { key: 2, tone: "caution", children: "Above your target" }),
            h(Pill, { key: 3, children: "Plain" }),
            h(Note, { key: 4, tone: "info", children: "Note" }),
            h(EmptyState, { key: 5, title: "Nothing yet" }),
          ],
        }),
      ],
    }),
  );

describe("patient kit and shell", () => {
  it("S1: no serious or critical axe violations", async () => {
    const { results } = await axeOf(page());
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });

  it("S3: Help is in the header, named, and the rail marks the current place; bare drops the rail, keeps Help", async () => {
    const { dom } = await axeOf(page());
    const help = dom.window.document.querySelector('a[href="/emergency"]');
    expect(help?.getAttribute("aria-label")).toBe("Help, emergency");
    expect(help?.hasAttribute("data-emergency-inline")).toBe(true);
    expect(dom.window.document.querySelector('nav a[aria-current="page"]')?.textContent).toContain(
      "Care",
    );
    expect(dom.window.document.querySelector('nav a[href="/patient/care"]')?.textContent).toContain(
      "2 due now",
    );
    const bare = new JSDOM(page(false, true)).window.document;
    expect(bare.querySelector("nav")).toBeNull();
    expect(bare.querySelector('a[href="/emergency"]')).not.toBeNull();
  });

  it("S3: the forced-light shell marks itself so the tokens stay light under a dark theme", () => {
    expect(page(true)).toContain("data-pw-light");
    expect(page(false)).not.toContain("data-pw-light");
  });

  it("the rail becomes the bottom pill at 760 px and the plus sits between Visits and Care", () => {
    const html = page();
    expect(html).toContain("max-[760px]:fixed");
    const order = [...html.matchAll(/href="(\/patient[^"]*)"|aria-label="(Add)"/g)].map(
      (m) => m[1] ?? m[2],
    );
    expect(order.slice(1, 6)).toEqual([
      "/patient",
      "/patient/visits",
      "Add",
      "/patient/care",
      "/patient/me",
    ]);
  });

  it("a disabled button shows its reason and is described by it", () => {
    const doc = new JSDOM(
      renderToStaticMarkup(h(Button, { disabledReason: "Choose a day first.", children: "Book" })),
    ).window.document;
    const b = doc.querySelector("button")!;
    expect(b.disabled).toBe(true);
    expect(doc.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Choose a day first.",
    );
  });
});
