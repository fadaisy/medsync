import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The tiered catalog at the Front door (ADR 0098): the desk asks the same
 * question the patient answers. Source-level, like the other reception
 * suites — the rules are about what each file may say and in what order.
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGES = ["app/reception/intake/page.tsx", "app/hospital-admin/intake/page.tsx"];
const ACTIONS = ["app/reception/intake/actions.ts", "app/hospital-admin/intake/actions.ts"];
const FORM = "components/intake/front-door-form.tsx";
const DESK = "components/intake/desk-catalog.tsx";
const LANE = [...PAGES, ...ACTIONS, FORM, DESK];

describe("Gate CS at the desk — both intake pages compute the render mode and fail closed", () => {
  for (const page of PAGES) {
    it(`${page} passes catalogRenderMode(signed) — status AND checksum — to the form`, () => {
      const src = stripComments(read(page));
      expect(src).toMatch(
        /fetchCatalogVersionStatus\(CATALOG\.version, CATALOG_CHECKSUM\)\.catch\(\(\) => null\)/,
      );
      expect(src).toMatch(/catalogRenderMode\(catalogStatus\?\.signed === true\)/);
      expect(src).toMatch(/catalogMode=\{catalogMode\}/);
    });
  }
});

describe("the form", () => {
  const form = stripComments(read(FORM));

  it("renders DeskCatalog only when the mode is not off, and the descriptive picker otherwise", () => {
    expect(form).toMatch(/const catalogOn = catalogMode !== "off"/);
    const start = form.indexOf("{catalogOn ? (");
    expect(start).toBeGreaterThan(-1);
    const block = form.slice(start, form.indexOf("compact", start));
    expect(block).toMatch(/<DeskCatalog/);
    expect(block).toMatch(/\) : \(\s*<SymptomPicker/);
    // Absent = off: a page that does not know about the catalog gets today's form.
    expect(form).toMatch(/catalogMode = "off"/);
  });

  it("keeps 'In their words' beside either selector", () => {
    expect(form).toContain("In their words (optional)");
  });

  it("composes the complaint from the catalog's lay labels through complaintLine", () => {
    expect(form).toMatch(/label: t\(CATALOG, item\.labelKey\)/);
    expect(form).toMatch(/label: t\(CATALOG, o\.labelKey\)/);
    expect(form).toMatch(/complaintLine\(complete, shownWords\)/);
  });

  it("the tier suggests the priority and never overrides a touched select", () => {
    expect(form).toMatch(/\{ E: "urgent", U: "high", R: "" \}\[report\.tier\]/);
    expect(form).toMatch(/priorityTouched \? priorityChoice : suggestedPriority/);
    // Choosing marks the select touched; nothing else writes priorityTouched.
    expect(form.match(/setPriorityTouched\(true\)/g)).toHaveLength(1);
    expect(form).not.toMatch(/setPriorityTouched\(false\)/);
    expect(form).toContain("Suggested from what they said");
  });

  it("posts the structured report as three hidden inputs", () => {
    for (const name of ["symptom_audience", "symptom_items", "symptom_qualifiers"]) {
      expect(form).toMatch(new RegExp(`name="${name}"`));
    }
  });
});

describe("desk-catalog", () => {
  const desk = stripComments(read(DESK));

  it("has no emergency interrupt: an E tier is words beside the tier word", () => {
    expect(desk).not.toMatch(/EmergencyInterrupt|emergency-interrupt|interrupt/i);
    expect(desk).toContain("Emergency tier — register now and alert the receiving unit");
  });

  it("classifies locally and shows the watermark in draft mode", () => {
    expect(desk).toMatch(/classify\(\{ audience: aud, items: selected, qualifiers \}, CATALOG\)/);
    expect(desk).toMatch(/mode === "draft_watermarked" \? <Watermark \/>/);
  });
});

describe("the actions", () => {
  for (const action of ACTIONS) {
    it(`${action} files pt-submit-symptoms as channel desk BEFORE ha-register-intake, and only when items are present`, () => {
      const src = stripComments(read(action));
      const submit = src.indexOf('"pt-submit-symptoms"');
      const register = src.indexOf("functions/v1/ha-register-intake");
      expect(submit).toBeGreaterThan(-1);
      expect(register).toBeGreaterThan(submit);
      expect(src).toMatch(/channel: "desk"/);
      expect(src).toMatch(/if \(rawItems\) \{/);
      expect(src).toMatch(/symptom_submission_id: symptomSubmissionId/);
    });
  }
});

describe("what the lane never says", () => {
  /** app/globals.css `@theme` and Tailwind's ramps, as tests/design/red-reserved.test.ts reads them. */
  const RED =
    /status-critical|destructive|\b(?:bg|text|border|ring)-(?:red|rose)-\d|#(?:dc2626|ef4444|b91c1c)\b/i;
  const REASSURANCE =
    /\b(not serious|you can wait|nothing to worry|probably fine|likely fine|no need to worry|is fine)\b/i;

  it("the new desk catalog draws no red", () => {
    expect(stripComments(read(DESK))).not.toMatch(RED);
  });

  it("no lane file adds reassurance vocabulary", () => {
    for (const p of LANE) expect(stripComments(read(p)), p).not.toMatch(REASSURANCE);
  });
});
