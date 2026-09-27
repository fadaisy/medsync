// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BlockProps } from "@/components/clerking/exam/blocks";
import type { ExamDraft } from "@/lib/clerking/exam/payload";
import type { NoteContent } from "@/lib/emr/note-rules";
import type { ReactNode } from "react";
import { act, createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AmtsBlock,
  ConsciousnessBlock,
  MotorGrids,
  PulsesGrid,
} from "@/components/clerking/exam/blocks";
import { deriveExam } from "@/components/clerking/exam/model";
import { historyOf } from "@/components/clerking/model";
import { emptyExam } from "@/lib/clerking/exam/payload";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { ecat, gcs, scenario } from "./exam-fixtures";
import { cat, v2Payload } from "./fixtures";
import { text } from "./press";

/**
 * The examination blocks (PROMPT-CLERKING-EXAM-V2 §5.2, §5.3, §5.6, §5.15, §10): what each shows
 * from the draft (static markup), and what a tap writes (mounted in jsdom around a draft held in
 * state, so each press goes through onExam and the answers.ts writers and re-renders).
 */

const view = (exam: ExamDraft) => {
  const p = v2Payload();
  const content = { ...p.draft!.content, exam: exam as unknown as NoteContent["exam"] };
  const history = historyOf(content);
  return deriveExam({
    ecat,
    cat,
    p,
    content,
    history,
    linked: linkedAnswers(cat, history.complaints),
  });
};
const draftWith = (fn: (s: ReturnType<typeof scenario>) => void = () => {}) => {
  const s = scenario();
  fn(s);
  return s.exam;
};
type Block = (p: BlockProps) => ReactNode;
const html = (block: Block, exam: ExamDraft, editable = true) =>
  renderToStaticMarkup(h(block, { v: view(exam), editable, onExam: () => {} }));
const noop = () => {};

/* ─── Mounted: a tap goes through onExam ──────────────────────────── */

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let draft: ExamDraft;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Harness({ start, block }: { start: ExamDraft; block: Block }) {
  const [exam, setExam] = useState(start);
  const onExam = (fn: (d: ExamDraft) => ExamDraft) => setExam((d) => (draft = fn(d)));
  return h(block, { v: view(exam), editable: true, onExam });
}
let mounts = 0;
/** A fresh block around `start` (a new key, so a second mount starts from its own draft). */
const mount = (block: Block, start = emptyExam(ecat.version)) => {
  draft = start;
  return act(async () => root.render(h(Harness, { key: mounts++, start, block })));
};
const click = (el: Element | null | undefined) => {
  expect(el, "element to press").toBeTruthy();
  return act(async () => (el as HTMLElement).click());
};
const group = (label: string) => host.querySelector(`[aria-label="${label}"]`)!;
const radio = (label: string, name: string) =>
  [...group(label).querySelectorAll('[role="radio"]')].find((b) => b.textContent === name);
const button = (name: string, scope: ParentNode = host) =>
  [...scope.querySelectorAll("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );
const checked = (label: string) =>
  [...group(label).querySelectorAll('[aria-checked="true"]')].map((b) => b.textContent);

/* ─── Consciousness ───────────────────────────────────────────────── */

describe("consciousness (§5.2)", () => {
  it("shows the GCS total in mono with its parts, and NT is never scored", () => {
    const m = html(
      ConsciousnessBlock,
      draftWith((s) => gcs(s, 3, 4, 6)),
    );
    expect(m).toMatch(/<output[^>]*font-mono[^>]*>GCS 13\/15 \(E3 V4 M6\)<\/output>/);
    expect(text(m)).toContain("4 Spontaneous");
    expect(text(m)).toContain("Known baseline");

    const nt = html(
      ConsciousnessBlock,
      draftWith((s) =>
        gcs(s, 3, undefined as unknown as number, 6, { nt: { V: "Intubated or tracheostomy" } }),
      ),
    );
    expect(text(nt)).toContain("GCS not totalled (E3 VNT M6)");
    expect(nt).toMatch(/aria-pressed="true"[^>]*>Intubated or tracheostomy</);
    // Not totalled: no baseline to offer, and NEWS2 waits for ACVPU.
    expect(text(nt)).not.toContain("Known baseline");
    expect(text(nt)).toContain("NEWS2 incomplete: choose ACVPU");
  });

  it("scores, clears on a second tap, and NT with a reason clears the score", async () => {
    await mount(ConsciousnessBlock);
    expect(text(host.innerHTML)).toContain("GCS not scored");
    await click(radio("Eye opening score", "3 To sound"));
    expect(draft.blocks.consciousness).toEqual({ method: "gcs", E: 3 });
    await click(radio("Eye opening score", "3 To sound"));
    // A block with only its method records nothing.
    expect(draft.blocks.consciousness).toBeUndefined();

    await click(radio("Verbal response score", "4 Confused"));
    await click(button("NT Not testable", group("Verbal response")));
    await click(button("Dysphasia"));
    expect(draft.blocks.consciousness).toEqual({ method: "gcs", nt: { V: "Dysphasia" } });
    expect(checked("Verbal response score")).toEqual([]);
  });

  it("suggests ACVPU below 15 but never applies it; GCS 15 gives Alert", async () => {
    const low = draftWith((s) => gcs(s, 3, 4, 6));
    const m = html(ConsciousnessBlock, low);
    expect(text(m)).toContain("Suggested: V (responds to voice) — you choose");
    expect(m).toMatch(/text-indigo-700[^>]*>.*Suggested: V/);
    const acvpu = /aria-label="ACVPU for NEWS2"(.*?)<\/div>/.exec(m)![1]!;
    expect(acvpu.match(/role="radio"/g)).toHaveLength(5);
    expect(acvpu).not.toContain('aria-checked="true"');
    expect(text(m)).toContain("NEWS2 incomplete: choose ACVPU");
    expect(view(low).exam.blocks.consciousness?.acvpu).toBeUndefined();
    expect(
      text(
        html(
          ConsciousnessBlock,
          draftWith((s) => gcs(s, 4, 4, 6)),
        ),
      ),
    ).toContain("Suggested: C (new confusion) — you choose");

    const full = html(
      ConsciousnessBlock,
      draftWith((s) => gcs(s, 4, 5, 6)),
    );
    expect(text(full)).toContain("ACVPU: Alert (from GCS 15)");
    expect(full).not.toContain("ACVPU for NEWS2");
    expect(text(full)).not.toMatch(/Suggested|Known baseline|NEWS2 incomplete/);

    await mount(ConsciousnessBlock, low);
    expect(checked("ACVPU for NEWS2")).toEqual([]);
    await click(radio("ACVPU for NEWS2", "C New confusion"));
    expect(draft.blocks.consciousness?.acvpu).toBe("C");
    expect(text(host.innerHTML)).not.toContain("NEWS2 incomplete");
  });

  it("known baseline is dropped when the GCS reaches 15", async () => {
    await mount(
      ConsciousnessBlock,
      draftWith((s) => gcs(s, 3, 5, 6)),
    );
    await click(button("Known baseline"));
    expect(draft.blocks.consciousness?.baseline).toBe(true);
    await click(radio("Eye opening score", "4 Spontaneous"));
    expect(draft.blocks.consciousness).toEqual({ method: "gcs", E: 4, V: 5, M: 6 });
  });

  it("orientation follows V: derived at 5, asked at 4, not assessable at 3 or below", async () => {
    const at = (V: number) =>
      text(
        html(
          ConsciousnessBlock,
          draftWith((s) => gcs(s, 4, V, 6)),
        ),
      );
    expect(at(5)).toContain("Oriented to time, place and person");
    expect(at(4)).toMatch(/Time Yes No.*Place Yes No.*Person Yes No/);
    expect(at(3)).toContain("Orientation not assessable");

    await mount(
      ConsciousnessBlock,
      draftWith((s) => gcs(s, 4, 4, 6)),
    );
    await click(button("No", group("Time")));
    expect(draft.blocks.consciousness?.orientation).toEqual({ time: "no" });
    await click(button("No", group("Time")));
    expect(draft.blocks.consciousness?.orientation).toBeUndefined();
  });

  it("ACVPU method records the level and stores nothing until one is chosen", async () => {
    await mount(ConsciousnessBlock);
    await click(button("ACVPU", group("Method")));
    expect(draft.blocks.consciousness).toBeUndefined();
    await click(radio("ACVPU for NEWS2", "A Alert"));
    expect(draft.blocks.consciousness).toEqual({ method: "acvpu", acvpu: "A" });
    expect(text(host.innerHTML)).toMatch(/Time Yes No/);
  });

  it("read-only in Nervous system: a summary line and Open in General", async () => {
    const m = renderToStaticMarkup(
      h(ConsciousnessBlock, {
        v: view(draftWith((s) => gcs(s, 4, 5, 6))),
        editable: true,
        onExam: noop,
        readOnly: true,
        onOpenOwner: noop,
      }),
    );
    expect(text(m)).toContain(
      "Consciousness: GCS 15/15 (E4 V5 M6) · oriented to time, place and person",
    );
    expect(text(m)).toContain("Open in General");
    expect(m).not.toContain('role="radio"');
  });
});

/* ─── AMTS ────────────────────────────────────────────────────────── */

describe("AMTS (§5.6)", () => {
  const answered = (score: number, n = 10) =>
    draftWith((s) => {
      s.exam.blocks.amts = Object.fromEntries(
        Array.from({ length: n }, (_, i) => [String(i + 1), i < score ? "correct" : "incorrect"]),
      ) as Record<string, "correct" | "incorrect">;
    });

  it("shows the Uganda wording on items 3, 8 and 9", () => {
    const m = html(AmtsBlock, emptyExam(ecat.version));
    expect(m.match(/Uganda wording/g)).toHaveLength(3);
    expect(text(m)).toContain("0 of 10 answered");
    expect(m.match(/aria-pressed="false"/g)).toHaveLength(20);
  });

  it("grades a complete score against REF-EX-AMTS-IMPAIRED, never a partial one", () => {
    const cut = ecat.refNumber("REF-EX-AMTS-IMPAIRED")!;
    const low = html(AmtsBlock, answered(cut));
    expect(low).toMatch(new RegExp(`data-tone="caution"[^]*AMTS ${cut}/10`));
    expect(text(low)).toContain(`${cut} or less suggests delirium or dementia`);
    const ok = html(AmtsBlock, answered(cut + 2));
    expect(ok).toMatch(new RegExp(`data-tone="ok"[^]*AMTS ${cut + 2}/10`));
    expect(text(ok)).not.toContain("suggests delirium");
    const partial = html(AmtsBlock, answered(1, 3));
    expect(text(partial)).toContain("3 of 10 answered");
    expect(partial).not.toContain("data-tone");
  });

  it("an answer toggles, and tapping it again clears", async () => {
    await mount(AmtsBlock);
    const item1 = group("1. Age");
    await click(button("Correct", item1));
    expect(draft.blocks.amts).toEqual({ "1": "correct" });
    await click(button("Correct", item1));
    expect(draft.blocks.amts).toBeUndefined();
  });
});

/* ─── Motor grids ─────────────────────────────────────────────────── */

describe("motor grids (§5.6, §10, §5.15)", () => {
  it("is a table with row and column headers, each cell a radio group", () => {
    const m = html(MotorGrids, emptyExam(ecat.version));
    const rows = ecat.grids.power.length + ecat.grids.reflexes.length;
    expect(m.match(/<th scope="col"[^>]*>Right<\/th>/g)).toHaveLength(2);
    expect(m.match(/<th scope="col"[^>]*>Left<\/th>/g)).toHaveLength(2);
    expect(m.match(/<th scope="row"/g)).toHaveLength(rows);
    expect(m).toMatch(/<th scope="row"[^>]*>Shoulder abduction<span[^>]*>C5<\/span><\/th>/);
    // Power and reflexes per side, then the two plantars.
    expect(m.match(/role="radiogroup"/g)).toHaveLength(rows * 2 + 2);
    expect(m).toContain('aria-label="Shoulder abduction, right"');
  });

  it("shows one side at a time on a phone, with a Right/Left switch", async () => {
    const m = html(MotorGrids, emptyExam(ecat.version));
    expect(m).toMatch(/<div class="sm:hidden"><div role="group" aria-label="Side shown"/);
    // On the phone the row header is visually hidden (kept for screen readers) and the row's
    // name sits above its buttons; 44 px targets.
    expect(m).toMatch(/<th scope="row" class="[^"]*max-sm:sr-only/);
    expect(m).toMatch(/role="radio"[^>]*class="[^"]*max-sm:size-11/);
    // Every phone rule is max-sm: or sm:hidden (640 px and up unchanged).
    expect(m).not.toMatch(/class="[^"]*(?<![\w:-])hidden(?![\w-])/);

    await mount(MotorGrids);
    const cellOf = (label: string) => group(label).closest("td")!;
    expect(cellOf("Shoulder abduction, right").className).not.toContain("max-sm:hidden");
    expect(cellOf("Shoulder abduction, left").className).toContain("max-sm:hidden");
    await click(button("Left", group("Side shown")));
    expect(cellOf("Shoulder abduction, right").className).toContain("max-sm:hidden");
    expect(cellOf("Shoulder abduction, left").className).not.toContain("max-sm:hidden");
  });

  it("All 5 and All 2 fill only unrecorded cells; 4− and 4+ sit beside 4", async () => {
    await mount(MotorGrids);
    await click(radio("Elbow flexion, left", "3"));
    await click(button("All 5"));
    expect(draft.blocks.power?.["Elbow flexion"]).toEqual({ L: "3", R: "5" });
    expect(Object.keys(draft.blocks.power!)).toHaveLength(ecat.grids.power.length);
    await click(button("All 2"));
    expect(Object.values(draft.blocks.reflexes!).every((c) => c.R === 2 && c.L === 2)).toBe(true);

    expect(button("Hip flexion, right: 4 minus")).toBeUndefined();
    await click(radio("Hip flexion, right", "4"));
    await click(button("Hip flexion, right: 4 minus"));
    expect(draft.blocks.power?.["Hip flexion"]?.R).toBe("4-");
    expect(checked("Hip flexion, right")).toEqual(["4−"]);
    await click(radio("Hip flexion, right", "4−"));
    expect(draft.blocks.power?.["Hip flexion"]?.R).toBeUndefined();
  });

  it("arrow keys move the score", async () => {
    await mount(MotorGrids);
    const g = group("Knee, right");
    await act(async () => {
      g.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(draft.blocks.reflexes?.Knee?.R).toBe(0);
    await act(async () => {
      g.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(draft.blocks.reflexes?.Knee?.R).toBe(1);
    expect(document.activeElement?.textContent).toBe("1");
  });

  it("plantars per side, and the motor hint is shown but not written", async () => {
    await mount(MotorGrids);
    await click(radio("Left plantar", "Extensor"));
    expect(draft.blocks.plantars).toEqual({ L: "extensor" });
    expect(text(host.innerHTML)).toContain(
      "Hint (not written to the note): Upper motor neurone pattern",
    );
    expect(view(draft).text).not.toMatch(/motor neurone/i);
    await click(radio("Left plantar", "Extensor"));
    expect(draft.blocks.plantars).toBeUndefined();
  });
});

/* ─── Pulses ──────────────────────────────────────────────────────── */

describe("pulses grid (§5.3)", () => {
  it("All present fills the rows shown; values are stored lowercase", async () => {
    await mount(PulsesGrid);
    await click(radio("Radial, left", "Absent"));
    await click(button("All present"));
    expect(draft.blocks.pulses?.Radial).toEqual({ L: "absent", R: "present" });
    expect(Object.keys(draft.blocks.pulses!)).toEqual(
      expect.arrayContaining([...ecat.grids.pulses]),
    );

    const feet = (p: BlockProps) =>
      h(PulsesGrid, { ...p, rows: ["Dorsalis pedis", "Posterior tibial"] });
    await mount(feet);
    await click(button("All present"));
    expect(Object.keys(draft.blocks.pulses!).sort()).toEqual([
      "Dorsalis pedis",
      "Posterior tibial",
    ]);
  });

  it("read-only: words in a table and Open in Cardiovascular", () => {
    const exam = draftWith((s) => {
      s.exam.blocks.pulses = { Femoral: { R: "reduced" } };
    });
    const m = renderToStaticMarkup(
      h(PulsesGrid, {
        v: view(exam),
        editable: true,
        onExam: noop,
        readOnly: true,
        onOpenOwner: noop,
      }),
    );
    expect(m).not.toContain('role="radio"');
    expect(m).not.toContain("Side shown");
    expect(text(m)).toContain("Femoral Reduced Not recorded");
    expect(text(m)).toContain("Open in Cardiovascular");
  });
});

/* ─── Every block ─────────────────────────────────────────────────── */

describe("every block", () => {
  it("disables every control when not editable (the phone side switch still works)", () => {
    const exam = draftWith((s) => gcs(s, 3, 4, 6));
    for (const block of [ConsciousnessBlock, AmtsBlock, MotorGrids, PulsesGrid] as Block[]) {
      const m = html(block, exam, false).replace(/aria-label="Side shown".*?<\/div>/, "");
      const buttons = [...m.matchAll(/<button[^>]*>/g)].map((x) => x[0]);
      expect(buttons.length, block.name).toBeGreaterThan(0);
      expect(
        buttons.filter((b) => !/\sdisabled=""/.test(b)),
        block.name,
      ).toEqual([]);
    }
  });

  it("never names red (D-CV-03)", () => {
    const src = readFileSync(
      resolve(__dirname, "../../components/clerking/exam/blocks.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\b(red|rose|destructive|status-critical)-/);
    expect(src).not.toMatch(/tone="critical"/);
  });
});
