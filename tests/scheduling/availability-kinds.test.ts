import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_CARD_CLASSES,
  AVAILABILITY_KIND_LABEL,
  AVAILABILITY_KIND_TONES,
} from "@/components/scheduling/calendar/helpers";
import { AVAILABILITY_KINDS } from "@/db/schema/scheduling";

/**
 * ADR 0095: the seven availability kinds live in migration 0065's CHECK, the
 * Drizzle constant, two zod enums (the Server Action and the Edge Function)
 * and one colour map. Parsed from source rather than retyped, in the manner
 * of reason-codes.test.ts, so a kind added on one side alone fails here.
 */
const ROOT = process.cwd();
const read = (f: string) => readFileSync(resolve(ROOT, f), "utf8");

function quotedList(src: string, afterMarker: string): string[] {
  const start = src.indexOf(afterMarker);
  expect(start, `marker not found: ${afterMarker}`).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf(")", start + afterMarker.length));
  return [...body.matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1] ?? "");
}

describe("migration 0065 availability_blocks_kind_check ↔ AVAILABILITY_KINDS", () => {
  it("the CHECK lists exactly the schema's kinds", () => {
    const sql = read("supabase/migrations/0065_symptoms_and_custom_blocks.sql");
    const marker = "ADD CONSTRAINT availability_blocks_kind_check";
    const start = sql.indexOf(marker);
    const body = sql.slice(start, sql.indexOf(");", start));
    const sqlKinds = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(sqlKinds).toEqual([...AVAILABILITY_KINDS]);
  });
});

describe("the writers accept every kind", () => {
  it("the Server Action's Kind enum", () => {
    const kinds = quotedList(read("app/clinician/availability/actions.ts"), "const Kind = z.enum(");
    expect(new Set(kinds)).toEqual(new Set(AVAILABILITY_KINDS));
  });

  it("ha-set-clinician-availability's kind enum", () => {
    const kinds = quotedList(
      read("supabase/functions/ha-set-clinician-availability/index.ts"),
      "kind: z.enum(",
    );
    expect(new Set(kinds)).toEqual(new Set(AVAILABILITY_KINDS));
  });
});

describe("one colour map, no red", () => {
  it("label, tone and card classes exist for every kind, in schema order", () => {
    expect(Object.keys(AVAILABILITY_KIND_LABEL)).toEqual([...AVAILABILITY_KINDS]);
    for (const kind of AVAILABILITY_KINDS) {
      expect(AVAILABILITY_KIND_TONES[kind], kind).toBeTruthy();
      expect(AVAILABILITY_CARD_CLASSES[kind], kind).toBeTruthy();
    }
  });

  it("no availability surface maps a kind to the critical tone or a red class", () => {
    const files = walk("app/clinician/availability")
      .concat(walk("app/doctor/schedule"), walk("components/scheduling"))
      .map((p) => [relative(ROOT, p), stripComments(read(p))] as const);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, src] of files) {
      for (const kind of AVAILABILITY_KINDS) {
        expect(src, file).not.toMatch(new RegExp(`${kind}:\\s*"critical"`));
        expect(src, file).not.toMatch(new RegExp(`${kind}:\\s*"[^"]*(red|rose|critical)-`));
      }
    }
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(resolve(ROOT, dir))) {
    const p = join(resolve(ROOT, dir), name);
    if (statSync(p).isDirectory()) walk(relative(ROOT, p), out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
