import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExamDraft } from "@/lib/clerking/exam/payload";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { deriveExam, withExam } from "@/components/clerking/exam/model";
import {
  news2Summary,
  savedFields,
  toSaveText,
  VitalsCard,
} from "@/components/clerking/exam/vitals-card";
import { historyOf } from "@/components/clerking/model";
import { NO_VITALS } from "@/lib/clerking/exam/context";
import { EXAM_CATALOGUE as ecat } from "@/lib/clerking/exam/load";
import { emptyExam } from "@/lib/clerking/exam/payload";
import { news2Of, saveLines } from "@/lib/clerking/exam/vitals";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { scoreNews2 } from "@/lib/triage/scoring/news2";
import { cat, THREE3_VITALS, v2Payload } from "./fixtures";

/**
 * The vital-signs card (PROMPT-CLERKING-EXAM-V2 §5.1, E6, E8), read from the server markup: the
 * rows in clinical order, one BP field, the required glucose context, air or oxygen and
 * consciousness read from General, the save button's gate, and no emergency colour anywhere.
 */

function view(exam?: Partial<ExamDraft>) {
  const p = v2Payload();
  const base = p.draft!.content;
  const content = exam
    ? withExam(base, { ...emptyExam(ecat.version), ...exam }, ecat.version)
    : base;
  const history = historyOf(content);
  return deriveExam({
    ecat,
    cat,
    p,
    content,
    history,
    linked: linkedAnswers(cat, history.complaints),
  });
}

const triage = {
  label: "Triage 23:00",
  at: "2026-09-27T20:00:00.000Z",
  values: {
    ...NO_VITALS,
    sbp: 110,
    dbp: 73,
    pulse: 54,
    rr: 12,
    spo2: 95,
    temp: 32.5,
    glucose: 5.8,
  },
  news2: scoreNews2(THREE3_VITALS),
  acvpu: null,
  oxygen: null,
};

function render(
  exam?: Partial<ExamDraft>,
  o: { editable?: boolean; act?: boolean; openPanel?: "postural" | "bothArms" | "peakFlow" } = {},
) {
  return renderToStaticMarkup(
    h(VitalsCard, {
      v: view(exam),
      editable: o.editable ?? true,
      act: o.act ?? true,
      onExam: () => {},
      onSave: async () => true,
      onGo: () => {},
      triage,
      time: () => "16:10",
      openPanel: o.openPanel ?? null,
    }),
  );
}

const rowLabels = (html: string) =>
  [...html.matchAll(/<th scope="row"[^>]*>(?:<label[^>]*>)?([^<]+)/g)].map((m) => m[1]);
const group = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}"`);
  expect(at).toBeGreaterThan(-1);
  const body = html.slice(at, html.indexOf("</div>", at));
  return [...body.matchAll(/<button[^>]*>(?:<svg.*?<\/svg>)?([^<]+)<\/button>/g)].map((m) => m[1]);
};

const ROOM_AIR = { state: "negative" as const, choice: "room_air" };
const GCS15 = { method: "gcs" as const, E: 4, V: 5, M: 6 };

describe("the table (§5.1)", () => {
  it("rows run in clinical order", () => {
    expect(rowLabels(render())).toEqual([
      "Blood pressure",
      "Pulse",
      "Respiratory rate",
      "SpO₂",
      "Temperature",
      "Glucose",
      "Air or oxygen",
      "Consciousness",
    ]);
  });

  it("the previous set heads its column; Now is the other", () => {
    const html = render();
    expect(html).toContain(">Triage 23:00</th>");
    expect(html).toContain(">Now</th>");
  });

  it("blood pressure is one field, typed as 118/76", () => {
    const html = render();
    expect(html.match(/aria-label="Blood pressure"/g)).toHaveLength(1);
    expect(html).toContain('placeholder="118/76"');
    expect(html).not.toMatch(/aria-label="(Systolic|Diastolic)/i);
    // Arm and position appear once a BP is typed (the empty table stays compact).
    expect(html).not.toContain('aria-label="Arm"');
    const typed = render({ vitalsDraft: { bp: "118/76" } });
    expect(group(typed, "Arm")).toEqual(["Right", "Left"]);
    expect(group(typed, "Position")).toEqual(["Lying", "Sitting", "Standing"]);
  });

  it("a BP that will not parse shows the engine's words, in amber, never the error colour", () => {
    const html = render({ vitalsDraft: { bp: "118" } });
    expect(html).toContain("Type BP as systolic/diastolic, for example 118/76");
    expect(html).toContain('aria-invalid="true"');
    expect(html).not.toMatch(/destructive|alert-bg|status-critical|220,38,38|\b(red|rose)-\d/);
  });

  it("number fields take a decimal keypad, mono tabular figures and 16 px on a phone", () => {
    const html = render();
    const pulse = /<input[^>]*aria-label="Pulse"[^>]*>/.exec(html)![0];
    expect(pulse).toContain('inputMode="decimal"');
    expect(pulse).toMatch(/font-mono/);
    expect(pulse).toMatch(/tabular-nums/);
    expect(pulse).toMatch(/max-sm:text-base/);
    expect(pulse).toMatch(/max-sm:min-h-11/);
    expect(pulse).toContain("data-advance");
  });

  it("glucose context is required, in three words, and never 'Not sure'", () => {
    const html = render({ vitalsDraft: { glucose: "6,1" } });
    expect(group(html, "Glucose context")).toEqual(["Random", "Fasting", "2 hours after food"]);
    expect(html).not.toContain("Not sure");
    expect(html).toContain("Choose random, fasting or 2 hours after food.");
  });

  it("an irregular pulse asks for the apical count and shows the apex–radial deficit", () => {
    expect(render({ vitalsDraft: { pulse: "80" } })).not.toContain("Apical count (60 s)");
    const html = render({
      vitalsDraft: { pulse: "80", rhythm: "irregularly_irregular", apex: "96" },
    });
    expect(html).toContain("Apical count (60 s)");
    expect(html).toMatch(/Apex–radial deficit <span[^>]*>16<\/span>\/min/);
  });

  it("an implausible value asks for a keep; once kept it does not", () => {
    expect(render({ vitalsDraft: { pulse: "300" } })).toContain("Outside the usual range: keep?");
    expect(render({ vitalsDraft: { pulse: "300", confirmed: ["pulse"] } })).not.toContain(
      "Outside the usual range",
    );
  });

  it("scores show as badges beside each value, with the change in words", () => {
    const html = render({ vitalsDraft: { temp: "35,8" } });
    expect(html).toMatch(/data-news2="3"/); // the previous set's 32.5 °C
    expect(html).toMatch(/data-news2="1"/); // now 35.8 °C
    expect(html).toContain("Temperature up from 32.5 to 35.8 °C; it now scores 1.");
    expect(render({ vitalsDraft: { temp: "36.8" } })).toContain(
      "Temperature up from 32.5 to 36.8 °C; it no longer scores.",
    );
  });
});

describe("air or oxygen and consciousness are read from General (E3, E6)", () => {
  it("not recorded: an amber line and a way to General", () => {
    const html = render();
    expect(html.match(/Not recorded: record in General/g)).toHaveLength(2);
    expect(html).toContain("Record air or oxygen");
    expect(html).toContain("Record consciousness");
  });

  it("room air, and supplemental oxygen with its modality", () => {
    expect(render({ entries: { "ex.general.oxygen": ROOM_AIR } })).toContain(
      "Room air (from General)",
    );
    const o2 = render({
      entries: {
        "ex.general.oxygen": {
          state: "positive",
          choice: "supplemental_oxygen",
          attrs: { modality: "cpap" },
        },
      },
    });
    expect(o2).toContain("Supplemental oxygen: CPAP (from General)");
    expect(o2).not.toContain("Record air or oxygen");
  });

  it("GCS 15 reads as Alert; below 15 asks for ACVPU", () => {
    expect(render({ blocks: { consciousness: GCS15 } })).toContain("GCS 15/15 (E4 V5 M6) → Alert");
    expect(render({ blocks: { consciousness: { ...GCS15, V: 4, M: 6 } } })).toContain(
      "→ choose ACVPU in General",
    );
  });
});

describe("save as a new set (E6)", () => {
  it("the button shows only when editable and clinical actions are allowed", () => {
    expect(render()).toContain("Save as a new set");
    expect(render(undefined, { editable: false })).not.toContain("Save as a new set");
    expect(render(undefined, { act: false })).not.toContain("Save as a new set");
  });

  it("a saved set replaces the button with its time", () => {
    const html = render({ vitalsSavedAt: "2026-09-27T13:10:00.000Z" });
    expect(html).toContain("Saved at 16:10 as a new set");
    expect(html).not.toContain("Save as a new set");
  });

  it("read-only: every field and control is disabled", () => {
    const html = render({ vitalsDraft: { rhythm: "irregularly_irregular" } }, { editable: false });
    const inputs = html.match(/<input[^>]*>/g)!;
    expect(inputs.length).toBeGreaterThan(8);
    for (const i of inputs) expect(i).toContain('disabled=""');
  });

  it("what is missing reads in words (the engine's list)", () => {
    const r = saveLines(ecat, { ...emptyExam(ecat.version), vitalsDraft: { pulse: "80" } }, "x");
    expect(r.ok).toBe(false);
    expect(toSaveText(r.ok ? [] : r.missing)).toBe(
      "To save: air or oxygen (General, attachments), consciousness (General).",
    );
  });

  it("the saved fields are the vs.* ids with a value", () => {
    expect(savedFields({ ...NO_VITALS, sbp: 118, dbp: 76, temp: 36.8 })).toEqual([
      "vs.bp",
      "vs.temp",
    ]);
  });
});

describe("the NEWS2 line", () => {
  const exam = (o: Partial<ExamDraft>) => ({ ...emptyExam(ecat.version), ...o });
  const values = { ...NO_VITALS, sbp: 118, pulse: 58, rr: 14, spo2: 96, temp: 36.8 };

  it("total and band, what changed, and what is missing in words", () => {
    const s = news2Summary(
      news2Of(values, exam({})),
      scoreNews2(THREE3_VITALS),
      new Set(["temperature"]),
    );
    expect(s.text).toMatch(/^NEWS2 \d+ · /);
    expect(s.messages).toEqual(["Temperature up from 32.5 to 36.8 °C; it no longer scores."]);
    expect(s.missing).toBe("Missing: consciousness and air or oxygen.");
  });

  it("a parameter scoring 3 is named, and a value not typed now makes no message", () => {
    const low = { ...values, temp: 34.9 };
    const s = news2Summary(news2Of(low, exam({})), scoreNews2(THREE3_VITALS), new Set());
    expect(s.threes).toEqual(["Temperature scores 3 on its own."]);
    expect(s.messages).toEqual([]);
    expect(s.tone).toBe("caution");
  });
});

describe("panels", () => {
  it("collapsed by default; a suggestion opens the one it names", () => {
    const closed = render();
    expect(closed).toMatch(/aria-expanded="false"/);
    expect(closed).not.toMatch(/<details open=""/);
    const open = render(undefined, { openPanel: "postural" });
    expect(open).toMatch(/aria-expanded="true"/);
    expect(open.match(/<details open=""/g)).toHaveLength(1);
    expect(open).toContain("Lying and standing BP");
  });
});

describe("the phone and the colour law", () => {
  it("rows stack below 640 px (max-sm only)", () => {
    const html = render();
    const rows = html.match(/<tr class="[^"]*"/g)!.filter((r) => r.includes("border-b"));
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(r).toContain("max-sm:flex-col");
    expect(html).toMatch(/<thead class="max-sm:hidden"/);
  });

  it("the source names no emergency colour", () => {
    const src = readFileSync(
      resolve(__dirname, "../../components/clerking/exam/vitals-card.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\b(red|rose|destructive|status-critical)-/);
  });
});
