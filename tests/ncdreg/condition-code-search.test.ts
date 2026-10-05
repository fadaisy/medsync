/**
 * §5.6: outside the standard module, NCD code never names a condition. This scans every registry
 * source file (lib/ncdreg, app/ncd, components/ncdreg, scripts/ncdreg*) except the standard module,
 * its seeds and fixtures, for each catalogue code as a whole-word string literal, and fails on a match.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";

const ROOT = resolve(__dirname, "../..");
const ROOTS = ["lib/ncdreg", "app/ncd", "components/ncdreg"];
const EXCLUDED = ["lib/ncdreg/standard/", "lib/ncdreg/fixtures/"];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|sql)$/.test(name)) out.push(p);
  }
  return out;
}

function registrySourceFiles(): string[] {
  const files = ROOTS.flatMap((r) => walk(join(ROOT, r)));
  for (const n of readdirSync(join(ROOT, "scripts")))
    if (n.startsWith("ncdreg")) files.push(join(ROOT, "scripts", n));
  return files.filter((f) => !EXCLUDED.some((e) => relative(ROOT, f).startsWith(e)));
}

describe("no condition code outside the standard module", () => {
  const files = registrySourceFiles();

  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const m of CONDITION_CATALOGUE) {
    it(`"${m.code}" appears as a string literal nowhere outside the standard`, () => {
      const re = new RegExp(`(["'\`])${m.code}\\1`);
      const hits = files
        .filter((f) => re.test(readFileSync(f, "utf8")))
        .map((f) => relative(ROOT, f));
      expect(hits).toEqual([]);
    });
  }
});
