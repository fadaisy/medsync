import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * S35 and D-UI-10: the field kit is the only way to ask for a date, pick a test or disable a button in the lab.
 * Fails the build on a native date input, a visible concept id, a disabled button without a reason, or a
 * dashed empty box anywhere under app/lab, and on raw concept ids typed into the lab's copy.
 */
const ROOT = resolve(__dirname, "../../..");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const LAB = files(resolve(ROOT, "app/lab")).map(
  (f) => [f.slice(ROOT.length + 1), strip(readFileSync(f, "utf8"))] as const,
);
const COPY = readdirSync(resolve(ROOT, "content"))
  .filter((f) => /^lab/.test(f))
  .map((f) => [`content/${f}`, strip(readFileSync(resolve(ROOT, "content", f), "utf8"))] as const);

/** The opening tags of `<Button …>` that carry a `disabled` prop (a `>` inside braces, like `=>`, is skipped). */
function buttonsWithDisabled(src: string): string[] {
  const hits: string[] = [];
  for (const m of src.matchAll(/<Button\b/g)) {
    let depth = 0;
    let i = m.index! + 7;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const tag = src.slice(m.index!, i);
    if (/\sdisabled[=\s]/.test(tag) || /\sdisabled$/.test(tag)) hits.push(tag.slice(0, 120));
  }
  return hits;
}

describe("field kit sweep (S35)", () => {
  it("scans the whole lab", () => expect(LAB.length).toBeGreaterThan(100));

  it("no native date, time or month input", () => {
    for (const [p, s] of LAB)
      expect(s, p).not.toMatch(/type=["'](?:date|datetime-local|time|month)["']/);
  });

  it("no visible concept id: no obs.* placeholder, label or text", () => {
    for (const [p, s] of [...LAB, ...COPY]) {
      expect(s, p).not.toMatch(/placeholder=["'][^"']*\bobs\.[a-z]/);
      expect(s, p).not.toMatch(/>[^<{]*\bobs\.[a-z_]+/);
      expect(s, p).not.toMatch(/["'`][^"'`]*\((?:obs|test)\.…?\)/);
    }
  });

  it("a disabled button always says why: no `disabled` on a shared Button in the lab", () => {
    for (const [p, s] of LAB) expect(buttonsWithDisabled(s), p).toEqual([]);
  });

  it("no dashed empty boxes", () => {
    for (const [p, s] of LAB) expect(s, p).not.toMatch(/\bborder-dashed\b/);
  });
});
