import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The catalog is behind sign-in, so axe never sees it pre-rendered (see
 * static-pages.test.ts); jsx-a11y's strict set holds it at lint time. These
 * are the PRD §7.5 rules the linter does not express: real radios inside a
 * fieldset with a legend, icons never alone, every icon-only control named,
 * no autofocus, and the tier word inside every emergency tile's accessible
 * name (screen-reader labels include the tier word).
 */
const DIR = resolve(process.cwd(), "app/patient/symptoms/_components");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => [f, readFileSync(resolve(DIR, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")] as const);

describe("symptom catalog — accessibility rules jsx-a11y cannot express", () => {
  it("every radio group is a <fieldset> with a <legend>", () => {
    for (const [name, src] of files) {
      const radios = src.match(/type="radio"/g)?.length ?? 0;
      if (radios === 0) continue;
      expect(src, name).toMatch(/<fieldset/);
      expect(src, name).toMatch(/<legend/);
    }
  });

  it("no control autofocuses; `/` is a shortcut, not a focus steal", () => {
    for (const [name, src] of files) expect(src, name).not.toMatch(/autoFocus/);
  });

  it("every Lucide icon is aria-hidden and every icon-only button has an aria-label", () => {
    for (const [name, src] of files) {
      for (const m of src.matchAll(/<([A-Z]\w*Icon)\b([^>]*)\/>/g)) {
        expect(m[2], `${name}: <${m[1]}>`).toMatch(/aria-hidden/);
      }
      // A button whose only child is an icon must be named.
      for (const m of src.matchAll(
        /<(?:button|Button)\b([^>]*)>\s*<[A-Z]\w*Icon[^>]*\/>\s*<\/(?:button|Button)>/g,
      )) {
        expect(m[1], `${name}: icon-only button`).toMatch(/aria-label/);
      }
    }
  });

  it("every emergency tile and row puts the tier word in its accessible name", () => {
    const row = files.find(([n]) => n === "item-row.tsx")?.[1] ?? "";
    expect(row).toMatch(/<span className="sr-only">, \{tierWord\}<\/span>/);
    const strip = files.find(([n]) => n === "danger-strip.tsx")?.[1] ?? "";
    expect(strip).toMatch(/<span className="sr-only">, \{t\(CATALOG, "tier\.E"\)\}<\/span>/);
  });

  it("the search input is labelled and the interrupt is an alertdialog with a name", () => {
    const search = files.find(([n]) => n === "search.tsx")?.[1] ?? "";
    expect(search).toMatch(/htmlFor="symptom-search"/);
    expect(search).toMatch(/id="symptom-search"/);
    const interrupt = files.find(([n]) => n === "emergency-interrupt.tsx")?.[1] ?? "";
    expect(interrupt).toMatch(/role="alertdialog"/);
    expect(interrupt).toMatch(/aria-labelledby="interrupt-title"/);
  });
});
