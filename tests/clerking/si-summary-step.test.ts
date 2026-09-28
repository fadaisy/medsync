// @vitest-environment jsdom
import type { DeskPayload } from "@/components/emr/desk/model";
import type { NoteContent } from "@/lib/emr/note-rules";
import { act, createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DX_CATALOGUE,
  DX_NAMES,
  DX_SIGNOFF,
  DX_TERM_IDS,
  dxTermUuid,
  TEST_NAMES,
  TEST_UUIDS,
} from "@/lib/clerking/impression/load";
import { ecat } from "./exam-fixtures";
import { cat, v2Payload } from "./fixtures";

/**
 * Step 08 in the v2 desk (PROMPT-CLERKING-SUMMARY-IMPRESSION §5.1–5.2, SI1, SI8, S-1): composed on
 * screen and in the note, reviewed in one tap, invalidated by any change, answered in place, and an
 * old draft's words kept. Synthetic patient only.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ClerkingDesk } = await import("@/components/clerking/clerking-desk");

const dx = {
  cat: DX_CATALOGUE,
  termIds: DX_TERM_IDS,
  names: DX_NAMES,
  tests: TEST_NAMES,
  testIds: TEST_UUIDS,
};

function payload(): DeskPayload {
  const p = v2Payload();
  p.clerking!.dx = {
    catalogueUrl: "/api/clerking/dx-catalogue?v=test",
    catalogueVersion: DX_CATALOGUE.version,
    signoff: DX_SIGNOFF,
  };
  p.diagnoses = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      display: "Sepsis",
      code: null,
      verification: "differential",
      rank: "secondary",
      restricted: false,
      onProblemList: false,
      cosignPending: false,
      ...{ logicalId: "00000000-0000-4000-8000-0000000000a1", termId: dxTermUuid("dx.sepsis") },
    },
  ];
  return p;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
/** The content the desk last wrote, and how many writes it made (the tap budget). */
let latest: NoteContent;
let writes = 0;

function Harness({ p, start }: { p: DeskPayload; start: NoteContent }) {
  const [content, setContent] = useState(start);
  return h(ClerkingDesk, {
    p,
    cat,
    ecat,
    dx,
    content,
    current: "summary",
    save: { tone: "neutral", text: "Saved 08:19" },
    actor: "u-1",
    on: {
      onContent: (c: NoteContent) => setContent(() => ((writes += 1), (latest = c))),
      onSection() {},
    },
    loaders: { findings: async () => [], terms: async () => [] },
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no matchMedia (the desk's phone check): a 1440 px desktop.
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  writes = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (p = payload(), start?: NoteContent) =>
  act(() => root.render(h(Harness, { p, start: start ?? p.draft!.content })));
const all = () => host.textContent ?? "";
const button = (name: string | RegExp) =>
  [...host.querySelectorAll("button")].find((b) =>
    typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? ""),
  )!;
const noteBlock = (key: string) => host.querySelector(`[data-block="${key}"]`)?.textContent ?? "";

describe("step 08, Summary", () => {
  it("composes on screen and in the note's own Summary block (S-1)", () => {
    mount();
    expect(all()).toContain("Composed, not reviewed");
    expect(all()).toMatch(/A 76-year-old man/);
    expect(noteBlock("summary")).toMatch(/A 76-year-old man/);
    expect(noteBlock("exam")).not.toContain("Summary:");
    expect(host.querySelector('[data-block="summary"]')?.getAttribute("data-current")).toBe("true");
    const step = host.querySelector('[data-step="summary"]');
    expect(step?.textContent).toContain("Composed");
    expect(all()).not.toContain("Auto");
  });

  it("is reviewed in one tap, and any change asks for review again (SI8)", () => {
    mount();
    act(() => button("Mark as reviewed").click());
    expect(writes).toBe(1);
    expect(all()).toContain("Reviewed by you");
    expect((latest.summary as { review?: { by: string } }).review?.by).toBe("u-1");
    // Leave the temperature out: the review is now stale and says what changed.
    const temp = [...host.querySelectorAll("label")].find((l) =>
      /Temperature 32\.5/.test(l.textContent ?? ""),
    )!;
    act(() => (document.getElementById(temp.htmlFor) as HTMLInputElement).click());
    expect(all()).toContain("Changed since review");
    expect(all()).toMatch(/Changed since your review at/);
    expect(all()).toMatch(/Left out\s*Temperature 32\.5/);
    expect(button("Review again")).toBeTruthy();
  });

  it("keeps the allergy row locked in", () => {
    mount();
    const row = [...host.querySelectorAll("label")].find((l) =>
      /always in/.test(l.textContent ?? ""),
    )!;
    expect((document.getElementById(row.htmlFor) as HTMLInputElement).disabled).toBe(true);
    expect(all()).toMatch(/Allergies: cold, uncoded/);
  });

  it("takes the syndrome in the clinician's words, and never names one itself (SI1, SI2)", () => {
    mount();
    expect(all()).not.toMatch(/: sepsis/i);
    const input = host.querySelector('input[placeholder^="In your words"]') as HTMLInputElement;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "polyuria with weight loss");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(noteBlock("summary")).toMatch(/illness: polyuria with weight loss\./);
  });

  it("asks what the differential needs and writes the answer to the history step (SI4)", () => {
    mount();
    expect(all()).toContain("Not asked yet, relevant to your differential");
    expect(all()).toMatch(/for Sepsis/);
    const row = [...host.querySelectorAll("[data-yesno]")].find((r) =>
      /Loin pain/.test(r.textContent ?? ""),
    );
    expect(row).toBeTruthy();
    act(() => (row!.querySelector('[data-answer="no"]') as HTMLButtonElement).click());
    expect((latest.history as { ros: Record<string, string> }).ros["sym.loin_pain"]).toBe("no");
    expect(all()).not.toMatch(/Loin pain · for Sepsis/);
  });

  it("opens an old draft's words in 'In my words', and migrates nothing on its own", () => {
    const p = payload();
    const start: NoteContent = {
      ...p.draft!.content,
      sections: { ...p.draft!.content.sections, s12: { narrative: "Elderly man, cold and slow." } },
    };
    mount(p, start);
    const words = host.querySelector(
      'textarea[aria-label="Summary, in your words"]',
    ) as HTMLTextAreaElement;
    expect(words.value).toBe("Elderly man, cold and slow.");
    expect(button("Continue in the composed format")).toBeTruthy();
    expect(noteBlock("summary")).toBe("SummaryElderly man, cold and slow.");
    expect(writes).toBe(0);
  });
});
