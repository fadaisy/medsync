/**
 * Lab test menu v2, Steps 10–11: S26 (no code path writes an offering keyed by LOINC), Law 9 (red reserved,
 * nothing green) on every new screen, and the strings are a draft the CSO signs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LAB_TEST_MENU_COPY_STATUS } from "@/content/lab-test-menu";

const ROOT = resolve(__dirname, "../..");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const f = join(d, n);
    return statSync(f).isDirectory()
      ? n === "node_modules" || n === ".next"
        ? []
        : walk(f)
      : /\.tsx?$/.test(n)
        ? [f]
        : [];
  });
const read = (f: string) => readFileSync(f, "utf8");

describe("S26: no code path writes an offering keyed by LOINC", () => {
  const files = ["app", "lib", "components", "scripts", "supabase/functions"].flatMap((d) =>
    walk(resolve(ROOT, d)),
  );
  it("every writer of diagnostic_offerings keys lab rows by a catalogue test", () => {
    const writers = files.filter((f) =>
      /insert\(diagnosticOfferings\)|INSERT INTO diagnostic_offerings|from\("diagnostic_offerings"\)\s*\.upsert/.test(
        read(f),
      ),
    );
    expect(writers.length).toBeGreaterThan(0);
    for (const f of writers) expect(read(f), f).not.toMatch(/loinc_codes|loincCodes/);
  });
  it("the hub op refuses lab rows; the test menu owns them", () => {
    const op = read(resolve(ROOT, "supabase/functions/ha-services-hub/ops-services.ts"));
    expect(op).toMatch(/Laboratory tests are set up in the test menu/);
  });
  it("loinc_codes is read only as a code reference, never as a menu", () => {
    const readers = files.filter((f) => /\bloincCodes\b|"loinc_codes"/.test(read(f)));
    for (const f of readers) expect(f).not.toMatch(/diagnostics|test-menu|services\/data/);
  });
});

describe("Law 9 on the new screens", () => {
  const ui = [
    ...walk(resolve(ROOT, "components/lab/test-menu")),
    resolve(ROOT, "app/lab/setup/menu/page.tsx"),
    resolve(ROOT, "app/admin/lab-catalogue-requests/page.tsx"),
    resolve(ROOT, "app/admin/lab-catalogue-requests/_components/request-queue.tsx"),
  ];
  it("no red, no green, no gradients, no left-edge accent bars", () => {
    for (const f of ui) {
      const s = read(f);
      expect(s, f).not.toMatch(/\b(?:bg|text|border)-(?:red|rose|green|emerald|lime)-\d/);
      expect(s, f).not.toMatch(/status-(?:critical|ok|success)/);
      expect(s, f).not.toMatch(/gradient|border-l-4/);
    }
  });
});

describe("strings", () => {
  it("are a draft until the CSO signs", () => {
    expect(LAB_TEST_MENU_COPY_STATUS.status).toBe("draft");
  });
});
