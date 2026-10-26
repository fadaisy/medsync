/**
 * Pharmacy Phase 4, Step 4 (Law 2, Law 3): only lib/emr/write/repeats.ts writes an authorisation, its events or a
 * renewal's answer, and nothing Phase 4 adds writes a prescription.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const sources = ["lib", "app", "components", "supabase/functions"].flatMap((d) =>
  walk(resolve(root, d)).map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") })),
);
const writers = (table: string) =>
  sources
    .filter((s) => new RegExp(`\\.(insert|update|delete)\\(${table}\\b`).test(s.text))
    .map((s) => s.path);

describe("Phase 4 writers", () => {
  it.each([
    "prescriptionRepeatAuthorisations",
    "prescriptionRepeatEvents",
    "prescriptionRenewalEvents",
  ])("only the repeats write path writes %s", (t) =>
    expect(writers(t)).toEqual(["lib/emr/write/repeats.ts"]),
  );

  it("the Phase 4 modules never write a prescription", () => {
    const phase4 = sources.filter((s) =>
      /lib\/emr\/(write|actions)\/repeats\.ts$|lib\/(pharmacy\/(refills|prepared|network-packs)|network\/)|app\/doctor\/renewals\//.test(
        s.path,
      ),
    );
    expect(phase4.length).toBeGreaterThan(3);
    for (const s of phase4)
      expect(s.text, s.path).not.toMatch(/\.(insert|update|delete)\(prescriptions\b/);
  });
});
