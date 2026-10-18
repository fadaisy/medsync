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

const C = "mobile/src/components/symptoms";
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

describe("S1 fits the 360×640 budget (PRD §7.2)", () => {
  it("the height constants object sums to at most 660", () => {
    const src = read(`${C}/catalog.tsx`);
    const m = /export const S1_BUDGET = \{([^}]*)\}/.exec(src);
    expect(m, "S1_BUDGET is missing").not.toBeNull();
    const numbers = [...(m?.[1] ?? "").matchAll(/:\s*(\d+)/g)].map((x) => Number(x[1]));
    expect(numbers.length).toBeGreaterThanOrEqual(5);
    expect(numbers.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(660);
  });

  it("no nested scroll region and no horizontal carousel on S1", () => {
    for (const file of ["catalog.tsx", "danger-strip.tsx", "category-grid.tsx", "search.tsx"]) {
      const src = stripComments(read(`${C}/${file}`));
      expect(src, file).not.toMatch(/\bhorizontal\b/);
      expect(src, file).not.toMatch(/<(FlatList|ScrollView)\b/);
    }
  });
});

describe("any item in three interactions (PRD §7.3)", () => {
  it("category grid → category sheet → tray Continue", () => {
    const grid = stripComments(read(`${C}/category-grid.tsx`));
    expect(grid).toMatch(/accessibilityRole="button"/);
    expect(grid).toMatch(/onPress=\{\(\) => onOpen\(category\)\}/); // 1: open the category

    const sheet = stripComments(read(`${C}/category-sheet.tsx`));
    expect(sheet).toMatch(
      /<ItemRow item=\{item\} selected=\{ticked\} onPress=\{\(\) => onToggle\(item\)\}/,
    ); // 2: tick

    const tray = stripComments(read(`${C}/selection-tray.tsx`));
    expect(tray).toMatch(/label="Continue" onPress=\{onContinue\}/); // 3: continue

    const catalog = stripComments(read(`${C}/catalog.tsx`));
    expect(catalog).toMatch(/onOpen=\{\(category\) =>\s*setSheet\(/);
    expect(catalog).toMatch(/<SelectionTray/);
    expect(catalog).toMatch(/onContinue=\{\(\) =>\s*onContinue\(/);
  });

  it("search is the two-step path: the results are the same tickable rows", () => {
    const search = stripComments(read(`${C}/search.tsx`));
    expect(search).toMatch(/searchItems\(CATALOG, audience, q\)/);
    expect(search).toMatch(
      /<ItemRow item=\{item\} selected=\{ticked\} onPress=\{\(\) => onToggle\(item\)\}/,
    );
  });
});

describe("the tier is a word, never a colour alone (PRD §7.5)", () => {
  it("the item row prints the tier word from the catalog's own strings", () => {
    const src = stripComments(read(`${C}/item-row.tsx`));
    expect(src).toMatch(/t\(CATALOG, TIER_LABEL_KEY\[item\.tier\]\)/);
    expect(src).toMatch(/\{tierWord\}/);
    // The screen-reader label carries it too, and the emergency marker has its word.
    expect(src).toMatch(/accessibilityLabel=\{`\$\{label\}\. .*\$\{tierWord\}`\}/);
    expect(src).toMatch(/>Emergency</);
  });

  it("the tray and the review name the tier beside every item", () => {
    for (const file of ["selection-tray.tsx", "review-outcome.tsx"]) {
      expect(stripComments(read(`${C}/${file}`)), file).toMatch(/TIER_LABEL_KEY\[item\.tier\]/);
    }
  });
});

describe("the emergency interrupt (PRD §5.4)", () => {
  it("is derived from the classification (the web's pattern) — an E item, a qualifier or a combination opens it; a decline holds until the item is removed", () => {
    const src = stripComments(read(`${C}/catalog.tsx`));
    expect(src).toMatch(/const local = classify\(\{ audience, items, qualifiers \}, CATALOG\)/);
    expect(src).toMatch(
      /local\.tier === "E" \? \(local\.reasons\.find\(\(k\) => !declined\.includes\(k\)\) \?\? null\) : null/,
    );
    const toggle = src.slice(src.indexOf("const toggle = "), src.indexOf("const answer = "));
    expect(toggle).toMatch(/setDeclined\(declined\.filter\(\(k\) => k !== item\.key\)\)/);
    const cont = src.slice(src.indexOf("onContinue=("), src.indexOf("onGetHelp"));
    expect(cont).not.toMatch(/setDeclined/);
    expect(src).toMatch(/<EmergencyInterrupt/);
  });

  it("fires the haptic and logs interrupt_shown, and the way back logs declined with the item", () => {
    const src = stripComments(read(`${C}/emergency-interrupt.tsx`));
    expect(src).toMatch(/Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Warning\)/);
    expect(src).toMatch(/emergencyEvent\(\{ event: "interrupt_shown", itemKey/);
    expect(src).toMatch(/emergencyEvent\(\{ event: "declined", itemKey/);
    expect(src).toMatch(/label="This is not happening now"/);
    // Through `telUrl`: a registered number with spaces must still dial on iOS.
    expect(src).toMatch(/Linking\.openURL\(telUrl\(emergencyPhone\)\)/);
    // PRD §5.5: a crisis_route item interrupts calmly — no haptic, the crisis screen.
    expect(src).toMatch(/const calm = item\?\.flags\?\.includes\("crisis_route"\)/);
    expect(src).toMatch(/if \(!calm\)\s*void Haptics\.notificationAsync/);
    // "Get help now" leads to the Emergency sheet with what was ticked (Tide v1: the lines screen).
    expect(stripComments(read(SCREEN))).toMatch(
      /pathname: "\/\(app\)\/emergency\/lines",\s*params: \{\s*from: "catalog"/,
    );
  });
});

describe("the outcome (PRD §7.2 S4)", () => {
  it("the review shows the catalog's own sentence on every outcome", () => {
    const src = stripComments(read(`${C}/review-outcome.tsx`));
    expect(src).toMatch(/t\(CATALOG, "catalog\.note"\)/);
    // Not inside a tier branch: the note is the last child of the stack.
    expect(src).toMatch(
      /<Text style=\{styles\.note\}>\{t\(CATALOG, "catalog\.note"\)\}<\/Text>\s*<\/View>\s*\);/,
    );
  });

  it("U goes to the same-day path, then today's queue; R carries the report to booking", () => {
    const src = stripComments(read(SCREEN));
    expect(src).toMatch(/requestSameDay\(\{/);
    expect(src).toMatch(/setNoSlot\(res\.noSlot\)/);
    expect(src).toMatch(/router\.push\("\/\(app\)\/today"\)/);
    expect(src).toMatch(/router\.push\("\/\(app\)\/book"\)/);
    expect(src).toMatch(/setPendingCatalogDraft\(\{/);
    // A failed submit keeps the choices and says so.
    expect(src).toMatch(/Your choices are kept/);
  });
});

describe("Gate CS on the phone (ADR 0098 ruling 2)", () => {
  it("the watermark says what it is", () => {
    expect(read(`${C}/watermark.tsx`)).toMatch(/Unsigned clinical content/);
  });

  // Tide v1 (ADR 0340) moved the door from the home to Book's "Something new": the catalog screen
  // reads the render mode itself; off, it shows no catalog and says so; a draft is watermarked.
  it("the catalog screen reads the render mode: off shows no catalog, a draft is watermarked", () => {
    expect(stripComments(read(BOOK))).toMatch(/why === "new" \? router\.push\("\/symptoms"\)/);
    const src = stripComments(read(SCREEN));
    expect(src).toMatch(/\buseCatalogMode \} from "@\/lib\/symptoms"/);
    expect(src).toMatch(/const mode = useCatalogMode\(\);/);
    const off = src.slice(src.indexOf('if (mode === "off")'));
    expect(off.slice(0, off.indexOf("}\n"))).toMatch(/This is not available yet\./);
    expect(off.slice(0, off.indexOf("}\n"))).not.toMatch(/<SymptomCatalog\b/);
    expect(src).toMatch(/mode === "draft_watermarked" \? <Watermark \/>/);
    expect(stripComments(read(`${C}/catalog.tsx`))).toMatch(/<DangerStrip\b/);
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
    expect(files.length).toBeGreaterThanOrEqual(13);
    for (const p of files) {
      const src = stripComments(readFileSync(p, "utf8"));
      expect(src, p).not.toMatch(REASSURANCE);
      expect(src, p).not.toMatch(DRUG_OR_DOSE);
    }
  });
});
