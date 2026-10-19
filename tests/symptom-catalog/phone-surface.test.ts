import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR 0098 ruling 11 — the phone's catalog surface (PRD MS-PRD-SYM-001 §7),
 * checked at the source level: no Playwright, no Detox in the tooling
 * floor, so the S1 height budget, the three-interaction path, the tier
 * word, the interrupt's binding and the copy bans are facts about the
 * files under `mobile/src`. Like tests/design/red-reserved.test.ts and
 * tests/booking/clinical-firewall.test.ts, which read the same tree.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const C = "mobile/src/features/symptoms";
const SCREEN = "mobile/src/app/(app)/symptoms.tsx";
const BOOK = "mobile/src/app/(app)/book/index.tsx";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

// Board D (owner, 19 Oct 2026) replaced S1–S4's grid, sheet and tray with three steps:
// tick what fits in one body area, a few questions, what to do. These hold that design.
describe("any item in three interactions (PRD §7.3, board D)", () => {
  it("area chip → tick → Continue", () => {
    const steps = stripComments(read(`${C}/steps.tsx`));
    expect(steps).toMatch(/onPress=\{\(\) => onArea\(c\.key\)\}/); // 1: the area (Book opens on it)
    expect(steps).toMatch(/onPress=\{\(\) => onToggle\(item\)\}/); // 2: tick
    const screen = stripComments(read(SCREEN));
    expect(screen).toMatch(/label=\{step === "pick" \? "Continue" : "See what to do"\}/); // 3: continue
    expect(screen).toMatch(/params\.area/);
  });

  it("the follow-ups are each chosen item's own qualifiers, in the catalogue's words", () => {
    expect(stripComments(read(`${C}/logic.ts`))).toMatch(/item\.qualifiers \?\? \[\]/);
    expect(stripComments(read(`${C}/steps.tsx`))).toMatch(/say\(CATALOG, q\.promptKey\)/);
  });
});

describe("the tier is a word, never a colour alone (PRD §7.5)", () => {
  it("emergency signs sit under their words, and every outcome's tag is the catalogue's tier word", () => {
    const danger = stripComments(read(`${C}/danger.tsx`));
    expect(danger).toMatch(/Any of these, right now\?/);
    expect(danger).toMatch(/say\(CATALOG, TIER_LABEL_KEY\.E\)/);
    expect(stripComments(read(`${C}/steps.tsx`))).toMatch(/say\(CATALOG, TIER_LABEL_KEY\[tier\]\)/);
  });
});

describe("the emergency interrupt (PRD §5.4)", () => {
  it("is derived from the classification — an E item, a qualifier or a combination opens it; a decline holds until the item is removed", () => {
    const logic = stripComments(read(`${C}/logic.ts`));
    expect(logic).toMatch(/const c = classify\(sel, pkg\)/);
    expect(logic).toMatch(/c\.reasons\.find\(\(k\) => !declined\.includes\(k\)\)/);
    const src = stripComments(read(SCREEN));
    expect(src).toMatch(/const interrupt = interruptOf\(selection, declined, CATALOG\)/);
    const toggle = src.slice(src.indexOf("const toggle = "), src.indexOf("const changeChoice = "));
    expect(toggle).toMatch(/setDeclined\(declined\.filter\(\(k\) => k !== item\.key\)\)/);
    expect(src).toMatch(/<HelpPanel/);
  });

  it("fires the haptic and logs interrupt_shown, and the way back logs declined with the item", () => {
    const src = stripComments(read(`${C}/danger.tsx`));
    expect(src).toMatch(/Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Warning\)/);
    expect(src).toMatch(/emergencyEvent\(\{ event: "interrupt_shown", itemKey/);
    expect(src).toMatch(/emergencyEvent\(\{ event: "declined", itemKey/);
    expect(src).toMatch(/label="This is not happening now"/);
    // Through `telUrl`: a registered number with spaces must still dial on iOS.
    expect(src).toMatch(/Linking\.openURL\(telUrl\(emergencyPhone\)\)/);
    // PRD §5.5: a crisis_route item interrupts calmly — no haptic, the crisis screen.
    expect(src).toMatch(/const calm = item\.flags\?\.includes\("crisis_route"\)/);
    expect(src).toMatch(/if \(!calm\)\s*void Haptics\.notificationAsync/);
    const screen = stripComments(read(SCREEN));
    expect(screen).toMatch(/router\.push\("\/\(app\)\/emergency\/crisis"\)/);
    // "Get help now" leads to the Emergency sheet with what was ticked (Tide v1: the lines screen).
    expect(screen).toMatch(
      /pathname: "\/\(app\)\/emergency\/lines",\s*params: \{\s*from: "catalog"/,
    );
  });
});

describe("the outcome (PRD §7.2 S4)", () => {
  it("the review shows the catalog's own sentence on every outcome", () => {
    const src = stripComments(read(SCREEN));
    const review = src.slice(src.lastIndexOf("<StepHead n={3}"));
    expect(review).toMatch(/say\(CATALOG, "catalog\.note"\)/);
  });

  it("U goes to the same-day path, then today's line; R carries the report to a day", () => {
    const src = stripComments(read(SCREEN));
    expect(src).toMatch(/requestSameDay\(\{/);
    expect(src).toMatch(/setNoSlot\(res\.noSlot\)/);
    expect(src).toMatch(/door\("\/book\/today"\)/);
    expect(src).toMatch(/door\("\/book\/day"\)/);
    expect(src).toMatch(/setPendingCatalogDraft\(\{/);
    // A failed submit keeps the choices and says so.
    expect(src).toMatch(/Your choices are kept/);
  });
});

describe("Gate CS on the phone (ADR 0098 ruling 2)", () => {
  it("the catalog screen reads the render mode: off shows no catalog, a draft is watermarked", () => {
    expect(stripComments(read(BOOK))).toMatch(
      /router\.push\(\{ pathname: "\/symptoms", params: \{ area/,
    );
    const src = stripComments(read(SCREEN));
    expect(src).toMatch(/\buseCatalogMode \} from "@\/lib\/symptoms"/);
    expect(src).toMatch(/const mode = useCatalogMode\(\);/);
    const off = src.slice(src.indexOf('if (mode === "off")'));
    expect(off.slice(0, off.indexOf("}\n"))).toMatch(/This is not available yet\./);
    expect(off.slice(0, off.indexOf("}\n"))).not.toMatch(/<PickStep\b/);
    expect(src).toMatch(/mode === "draft_watermarked" \? \(\s*<Note tone="caution"/);
    expect(src).toMatch(/Unsigned clinical content/);
  });

  it("the screen is permanently light (Law 3)", () => {
    expect(read(SCREEN)).toMatch(/<ForcedScheme scheme="light">/);
  });
});

describe("the report reaches the doors (ADR 0098 ruling 3)", () => {
  // Tide v1 (ADR 0340): the doors are the day request and the line, in mobile/src/data/visits.ts.
  it("the day request, the line and today's queue send symptom_submission_id and clear the draft", () => {
    const visits = stripComments(read("mobile/src/data/visits.ts"));
    for (const door of ["export async function requestDay", "export async function joinLine"]) {
      const body = visits.slice(visits.indexOf(door));
      const fn = body.slice(0, body.indexOf("\n}\n"));
      expect(fn, door).toMatch(/symptomSubmissionId: getPendingCatalogDraft\(\)\?\.submissionId,/);
      expect(fn, door).toMatch(/clearPendingCatalogDraft\(\);/);
    }
    const booking = stripComments(read("mobile/src/lib/booking.ts"));
    expect(booking).toMatch(/symptom_submission_id: input\.symptomSubmissionId/);
    expect(read("mobile/src/app/(app)/today.tsx")).toMatch(
      /symptomSubmissionId: report\?\.submissionId,/,
    );
  });
});

describe("copy (ADR 0098 Law 4)", () => {
  const REASSURANCE =
    /\b(not serious|nothing to worry|no need to worry|don'?t worry|you can wait|it'?s fine|probably fine|harmless|safe to wait|no cause for concern)\b/i;
  const DRUG_OR_DOSE = /\b(paracetamol|ibuprofen|amoxicillin|artemether|\d+\s?(mg|ml|mmol|bpm))\b/i;

  it("no catalog surface reassures, names a drug or a dose", () => {
    const files = [
      ...walk(resolve(ROOT, C)),
      resolve(ROOT, SCREEN),
      resolve(ROOT, "mobile/src/lib/symptoms.ts"),
    ];
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const p of files) {
      const src = stripComments(readFileSync(p, "utf8"));
      expect(src, p).not.toMatch(REASSURANCE);
      expect(src, p).not.toMatch(DRUG_OR_DOSE);
    }
  });
});
