import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `presenceAt` is a raw SQL expression; a Date compared against it goes to
 * postgres.js untyped and the driver throws — which took /reception and the
 * patient's queue page down for eight days without a failing test. Every
 * comparison binds the instant through `ts()`.
 */
const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe("presenceAt comparisons", () => {
  it("bind their Date through ts(), never raw", () => {
    const files = [...walk(resolve(ROOT, "lib")), ...walk(resolve(ROOT, "app"))];
    for (const p of files) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/\b(?:gte|gt|lte|lt|eq|between)\(presenceAt,\s*([^)]+?)\)/g)) {
        expect(m[1], `${p}: ${m[0]}`).toMatch(/^ts\(/);
      }
    }
  });
});
