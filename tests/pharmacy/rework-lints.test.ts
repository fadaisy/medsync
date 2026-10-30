/**
 * Pharmacy rework safety test 11 (TECH-SPEC §7, PRD S12): no build codes in the pharmacy's words, and no coloured
 * side-accent borders in the pharmacy or the Tide kit (owner rule). Comments may cite records; strings may not.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const BUILD_CODE = /ADR \d|D-PH|Phase \d|\bseam\b/;

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) ? [p] : [];
  });
}

/** String literals (quotes and templates) with comments removed first. */
export function stringsOf(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  return [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );
}

describe("pharmacy rework lints", () => {
  it("S12: no build codes in the pharmacy's words", () => {
    const hits = readdirSync(join(ROOT, "content"))
      .filter((f) => f.startsWith("pharmacy") && f.endsWith(".ts"))
      .flatMap((f) =>
        stringsOf(readFileSync(join(ROOT, "content", f), "utf8"))
          .filter((s) => BUILD_CODE.test(s))
          .map((s) => `${f}: ${s.slice(0, 80)}`),
      );
    expect(hits).toEqual([]);
  });

  it("no coloured left-accent borders in the pharmacy or the Tide kit", () => {
    // Left or start edges: the accent bar the owner rule forbids. A divider between chart segments is not one.
    const accent = /\bborder-[ls]-(?:\[|\d|[a-z])|border-(?:left|inline-start)\s*:/;
    const hits = [
      ...files(join(ROOT, "app/pharmacy"), /\.(tsx?|css)$/),
      ...files(join(ROOT, "components/tide"), /\.(tsx?|css)$/),
    ].filter((p) => accent.test(readFileSync(p, "utf8")));
    expect(hits.map((p) => p.slice(ROOT.length + 1))).toEqual([]);
  });

  it("the string reader skips comments", () => {
    expect(stringsOf(`// ADR 0001\nconst a = "Hand over"; /* Phase 2 */`)).toEqual(["Hand over"]);
  });
});
