import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeskPayload } from "@/components/emr/desk/model";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { deriveDesk } from "@/components/clerking/model";
import { cat, chestPainVariant, header, patientThree3, v2Payload } from "./fixtures";

/**
 * Clerking desk v2 on a phone (PROMPT-CLERKING-MOBILE): what a phone shows, read from the static
 * markup with the classes that hide an element below 640 px, and that 640 px and up stay as they
 * were (every phone rule is `max-sm:` or `sm:hidden`).
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ClerkingDesk } = await import("@/components/clerking/clerking-desk");
const { ComplaintBody } = await import("@/components/clerking/history-sections");
const { SystemsView } = await import("@/components/clerking/systems-body");
const { PhoneBottomBar, PhoneStepBar } = await import("@/components/clerking/phone-shell");
const { DeskTopBar } = await import("@/app/doctor/encounters/[encounterId]/_desk/desk-top-bar");
const { SECTIONS } = await import("@/lib/clerking/status");

const ROOT = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Hidden below 640 px: `max-sm:hidden`, or a bare `hidden` not undone by a `max-sm:` display. */
function hiddenOnPhone(cls: string): boolean {
  const t = cls.split(/\s+/);
  if (t.includes("max-sm:hidden") || t.includes("max-sm:sr-only") || t.includes("sr-only"))
    return true;
  return t.includes("hidden") && !t.some((x) => /^max-sm:(flex|block|grid|inline)/.test(x));
}

/** Every text run with the classes of its open ancestors. */
function texts(html: string): { text: string; classes: string[] }[] {
  const out: { text: string; classes: string[] }[] = [];
  const stack: { tag: string; cls: string }[] = [];
  const VOID = new Set(["input", "img", "br", "hr", "meta", "link", "path", "circle", "rect"]);
  for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9-]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) {
      const text = m[5].replace(/&#x27;/g, "'").trim();
      if (text) out.push({ text, classes: stack.map((s) => s.cls) });
      continue;
    }
    const [, close, tag, attrs = "", self] = m;
    if (close) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag!);
      if (i >= 0) stack.splice(i);
    } else if (!self && !VOID.has(tag!)) {
      const hiddenAttr = /\shidden(=|\s|$)/.test(attrs);
      const cls = (/class="([^"]*)"/.exec(attrs)?.[1] ?? "") + (hiddenAttr ? " sr-only" : "");
      stack.push({ tag: tag!, cls });
    }
  }
  return out;
}
const onPhone = (html: string) => texts(html).filter((t) => !t.classes.some(hiddenOnPhone));

function desk(p: DeskPayload, current = "complaint") {
  return renderToStaticMarkup(
    h(ClerkingDesk, {
      p,
      cat,
      content: p.draft!.content,
      current,
      save: { tone: "neutral", text: "Saved 08:19" },
      on: {},
      loaders: { findings: async () => [], terms: async () => [] },
    }),
  );
}

describe("the phone shows one step label (M3)", () => {
  it.each(["complaint", "systems", "social"])("on %s: 'Step N of 10' once", (step) => {
    const html = desk(v2Payload(), step);
    const n = SECTIONS.findIndex((s) => s.id === step) + 1;
    const labels = onPhone(html).filter((t) => t.text.includes(`Step ${n} of 10`));
    expect(labels).toHaveLength(1);
    // …and the tablet and desktop keep theirs (not hidden above 640 px).
    expect(html.match(new RegExp(`Step ${n} of 10`, "g"))!.length).toBeGreaterThan(1);
  });

  it("the patient's name and MRN are on the phone, with the four tiles", () => {
    const html = desk(v2Payload());
    const words = onPhone(html).map((t) => t.text);
    expect(words).toContain("Patient Three-3");
    expect(words).toContain("MS-2026-00004");
    for (const label of ["Allergies", "Vital signs", "Active problems", "Critical results"])
      expect(html).toContain(`aria-label="${label}, `);
    expect(words.filter((w) => w === "Context")).toHaveLength(0); // no Context button (D-CM-03)
  });
});

describe("review of systems on a phone (M4)", () => {
  it("no status word sits in a truncating element", () => {
    const html = renderToStaticMarkup(
      h(SystemsView, {
        cat,
        header,
        history: patientThree3(),
        onHeader: () => {},
        onHistory: () => {},
        editable: true,
        cautionFrom: 7,
        sex: "male",
        open: null,
        onOpen: () => {},
        onDetails: () => {},
      }),
    );
    const statuses = texts(html).filter((t) =>
      /^(Not reviewed|Partly reviewed|Nothing to report|\d+ positive)$/.test(t.text),
    );
    expect(statuses.length).toBeGreaterThan(8);
    for (const s of statuses)
      expect(s.classes.join(" ").split(/\s+/), s.text).not.toContain("truncate");
    expect(html.match(/aria-label="Nothing else in /g)!.length).toBeGreaterThan(0);
  });
});

describe("badges where the answer is, phone only (D-CM-04)", () => {
  it("a complaint row carries its badges in a list hidden from 640 px up", () => {
    const p = v2Payload(chestPainVariant());
    const d = deriveDesk(cat, p, p.draft!.content);
    const back = d.badges.find((b) => b.reasons.some((r) => r.where === "Back pain"));
    expect(back).toBeDefined();
    const html = renderToStaticMarkup(
      h(ComplaintBody, {
        cat,
        header,
        history: d.history,
        onHeader: () => {},
        onHistory: () => {},
        editable: true,
        cautionFrom: 7,
        badges: d.badges,
      }),
    );
    expect(html).toMatch(/<ul aria-label="Flags for this answer" class="[^"]*sm:hidden/);
    expect(html).toContain(back!.label);
  });
});

describe("the step bar and bottom bar", () => {
  it("the step bar names step and title, and adds name and MRN once the header has gone", () => {
    const bar = (identity: { name: string; mrn: string } | null) =>
      renderToStaticMarkup(
        h(PhoneStepBar, {
          at: 2,
          statuses: null,
          badges: [],
          identity,
          onSteps: () => {},
          onNote: () => {},
        }),
      );
    expect(bar(null)).toContain('aria-label="Step 3 of 10, Review of systems. Open all steps"');
    expect(bar(null)).toContain('aria-label="Note and flags, 0 flags, 0 urgent"');
    expect(bar(null)).not.toContain("MS-2026-00004");
    const on = bar({ name: "Patient Three-3", mrn: "MS-2026-00004" });
    expect(on).toContain("Patient Three-3");
    expect(on).toMatch(/shrink-0 font-mono">MS-2026-00004/); // the MRN never truncates
  });

  it("the last step's primary action is Review and sign (D-CM-06)", () => {
    const html = renderToStaticMarkup(
      h(PhoneBottomBar, { prev: SECTIONS[8], next: undefined, onGo: () => {}, onReview: () => {} }),
    );
    expect(html).toContain("Review and sign");
    expect(html).toContain('aria-label="Previous: Impression"');
    expect(html).toContain('aria-label="Step controls"');
  });
});

describe("640 px and up are untouched", () => {
  it("the phone shell's roots are all sm:hidden", () => {
    const shell = src("components/clerking/phone-shell.tsx");
    for (const slot of ["phone-patient-header", "phone-step-bar", "phone-bottom-bar"])
      expect(shell).toMatch(new RegExp(`data-slot="${slot}"\\s+[^>]*sm:hidden`));
  });

  it("the phone class constants hold only max-sm: rules", () => {
    const controls = src("components/clerking/controls.tsx");
    const dialog = src("components/emr/emr-dialog.tsx");
    const constant = (file: string, name: string) =>
      new RegExp(`const ${name} =\\s*"([^"]+)"`).exec(file)![1]!.split(/\s+/);
    for (const [file, name] of [
      [controls, "PANEL"],
      [controls, "PANEL_HEAD"],
      [controls, "PHONE_CHIP"],
      [dialog, "SHEET"],
      [dialog, "SHEET_FOOTER"],
    ] as const)
      for (const t of constant(file, name)) expect(t, `${name}: ${t}`).toMatch(/^max-sm:/);
  });

  it("the v1 desk keeps its top bar exactly: no phone classes, no avatar", () => {
    const props = {
      back: { href: "/doctor", label: "Workspace" },
      hospital: "Test Hospital",
      department: "Internal Medicine",
      cadreWord: "Medical officer",
    };
    const v1 = renderToStaticMarkup(h(DeskTopBar, { ...props, phone: false }));
    expect(v1).not.toMatch(/max-sm:|sm:hidden/);
    expect(v1).not.toContain("Account:");
    expect(v1).toContain("Sign out");
    const v2 = renderToStaticMarkup(h(DeskTopBar, props));
    expect(v2).toContain('aria-label="Account: Medical officer"');
    expect(v2).toContain(">MO<");
  });
});
