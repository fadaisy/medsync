import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const UI = "components/clinics-schedule";
const files = (dir: string) => readdirSync(dir).map((f) => join(dir, f));
const ui = files(UI).filter((f) => f.endsWith(".tsx"));
const read = (f: string) => readFileSync(f, "utf8");

describe("guards (Appendix C)", () => {
  it("no raw colour outside the palette and the colour picker", () => {
    for (const f of [...ui, `${UI}/cs.module.css`]) {
      if (f.endsWith("clinics.tsx")) continue; // the picker draws its own hue and shade gradients
      expect(read(f).match(/#[0-9a-fA-F]{6}\b|rgba?\(/g) ?? [], f).toEqual([]);
    }
  });

  it("no fee written into the UI (fees come from bands or the clinic)", () => {
    for (const f of ui) expect(read(f).match(/\b\d{1,3},\d{2}0\b|UGX\s*\d/g) ?? [], f).toEqual([]);
  });

  it("no visible sentence in the UI files (strings live in content/clinics-schedule)", () => {
    // JSX text of three or more words outside {…} is copy that skipped the content file.
    for (const f of ui)
      expect(read(f).match(/>\s*[A-Z][a-z]+(?: [a-z]+){2,}[^<{]*</g) ?? [], f).toEqual([]);
  });

  it("one record per fact: the new tables hold no clinic, session, place, person or closure columns", () => {
    const sql = read("supabase/migrations/0296_clinics_schedule.sql");
    const created = [...sql.matchAll(/CREATE TABLE[^(]*public\.(\w+)\s*\(([\s\S]*?)\n\);/g)];
    expect(created.length).toBeGreaterThan(0);
    for (const [, name, body] of created)
      expect(
        body!.match(
          /\b(start_minutes_local|weekday|room_place_ids|full_name|starts_on|patient_words)\b/g,
        ) ?? [],
        name,
      ).toEqual([]);
  });

  it("migrations 0296 and 0298 are GATED", () => {
    expect(read("supabase/migrations/0296_clinics_schedule.sql").startsWith("-- GATED")).toBe(true);
    expect(
      read("supabase/migrations/0298_clinics_schedule_cutover.sql").startsWith("-- GATED"),
    ).toBe(true);
  });
});
