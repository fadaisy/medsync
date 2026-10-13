import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A server component cannot call a function exported from a "use client" module: it gets a client
 * reference and throws at render. `outcomeChip()` did this on /lab/quality/eqa and crashed the page once
 * a round was scored (found by the Lab Phase 3 screenshot harness). This scans the Phase 3 trees: every
 * lower-case name a server file imports from a client module must not be called there.
 */
const TREES = [
  "app/lab",
  "app/nurse/bedside",
  "app/hmis",
  "app/hospital-admin/reports",
  "components/lab",
];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
const isClient = (src: string) => /^\s*["']use client["']/.test(src);
const resolveImport = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/")
    ? resolve(spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  return (
    [".tsx", ".ts", "/index.tsx", "/index.ts"].map((x) => base + x).find((p) => existsSync(p)) ??
    null
  );
};

describe("server files never call a client module's function", () => {
  it("in every Phase 3 tree", () => {
    const bad: string[] = [];
    for (const f of TREES.flatMap(files)) {
      const src = readFileSync(f, "utf8");
      if (isClient(src)) continue;
      for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
        const target = resolveImport(f, m[2]!);
        if (!target || !isClient(readFileSync(target, "utf8"))) continue;
        for (const name of m[1]!.split(",").map(
          (s) =>
            s
              .trim()
              .split(/\s+as\s+/)
              .pop()!,
        )) {
          if (/^[a-z]/.test(name) && new RegExp(`(?<![\\w.])${name}\\(`).test(src))
            bad.push(`${f}: ${name}() from ${m[2]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
