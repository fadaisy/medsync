import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The patient web's guards (PROMPT-PATIENT-WEB-TIDE Appendix B), as source scans over every patient-web file:
 * the kit (components/tide), the new pages (app/pw) and their copy (content/patient). Rendered-route checks
 * (the Help crawl at three widths, the no-dose scan of rendered HTML) run in scripts/patient-web/harness.mjs.
 */
const ROOT = process.cwd();
const DIRS = ["components/tide", "app/pw", "content/patient"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) ? [relative(ROOT, p)] : [];
  });
}
const FILES = DIRS.flatMap((d) => walk(join(ROOT, d)));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** Code without comments, so a rule's own explanation never trips it. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Files that may paint red: the Help pill, the danger tone and a critical StatusPill (L3). Areas add theirs. */
const RED_ALLOWED = [
  "components/tide/kit.tsx",
  "components/tide/shell.tsx",
  "components/tide/reading-check.tsx", // the chest-pain row and the danger interrupt
];
/** Files that may paint amber or green: StatusPill and Note (L4). Areas add the check band and the charts. */
const SIGNAL_ALLOWED = ["components/tide/kit.tsx", "components/tide/reading-check.tsx"];

describe("patient web guards", () => {
  it("scans something", () => expect(FILES.length).toBeGreaterThan(5));

  it("raw colour: no hex, rgb, hsl or named colour; no font family outside the tokens (L12)", () => {
    for (const f of FILES) {
      const m =
        /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|\b(?:bg|text|ring|border|fill|stroke)-(?:red|amber|green|blue|slate|gray|white|black)\b|font-\[|fontFamily/.exec(
          code(f),
        );
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("red is reserved (L3)", () => {
    for (const f of FILES.filter((f) => !RED_ALLOWED.includes(f))) {
      const m = /pw-(emergency|critical)/.exec(code(f));
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("amber and green are clinical signals only (L4)", () => {
    for (const f of FILES.filter((f) => !SIGNAL_ALLOWED.includes(f))) {
      const m = /pw-(caution|stable)/.exec(code(f));
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("no dose (L5)", () => {
    for (const f of FILES) {
      const src = code(f);
      const m =
        /["'`>][^"'`<]*\b\d+(\.\d+)?\s?(mg|mcg|µg|IU|units?|mL|ml)\b/.exec(src) ??
        /["'`>][^"'`<]*\b\d+\s?(tablets?|tabs?|capsules?|puffs?|drops?)\b/i.exec(src);
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("queue honesty (L8): no position, no count ahead, no number in line", () => {
    for (const f of FILES) {
      const m = /\bposition\b|ahead of you|in line\s*#?\d|#\d+\s*(in\s+)?(line|queue)/i.exec(
        code(f),
      );
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("a disabled Button always says why", () => {
    for (const f of FILES.filter((f) => f.startsWith("app/pw"))) {
      const m = /<Button\b[^>]*\sdisabled[=\s>]/.exec(code(f));
      expect(m, `${f}: use disabledReason`).toBeNull();
    }
  });

  it("dialogs are centred: no sheet or drawer (W1, ADR 0161)", () => {
    for (const f of FILES) {
      const m = /\b(Sheet|Drawer|ResponsiveSheet)\b/.exec(code(f));
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("no PHI in browser storage without the own-device choice (W3): storage only through the device module", () => {
    for (const f of FILES) {
      const m = /\b(localStorage|sessionStorage|indexedDB|caches\.open)\b/.exec(code(f));
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("forced light (L11): the tokens keep light values under a dark theme when a page renders data-pw-light", () => {
    const css = read("app/globals.css");
    const block = css.slice(
      css.indexOf("/* pw-tokens:start */"),
      css.indexOf("/* pw-tokens:end */"),
    );
    expect(block).toMatch(
      /:root:has\(\[data-pw\]\),\n:root\.dark:has\(\[data-pw-light\]\) \{\n  --pw-bg: #f6f7f9;/,
    );
    expect(block).toMatch(/:root\.dark:has\(\[data-pw\]\):not\(:has\(\[data-pw-light\]\)\)/);
  });

  it("the token block is the phone's tide.ts, regenerated (one source)", () => {
    const css = read("app/globals.css");
    const block = css.slice(
      css.indexOf("/* pw-tokens:start */") + "/* pw-tokens:start */".length,
      css.indexOf("/* pw-tokens:end */"),
    );
    const fresh = execFileSync(
      "node",
      ["scripts/patient-web/gen-tokens.mjs", "mobile/src/theme/tide.ts"],
      { encoding: "utf8" },
    );
    expect(block.trim()).toBe(fresh.trim());
  });
});
