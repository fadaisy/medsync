import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * lib/emergency — the read models' invariants (ADR 0098; PRD §9.3).
 * Source-level: Drizzle runs as the DB owner and bypasses RLS, so the tenant
 * pin is a fact about each query's own `where`, not about a database row.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const QUERIES = stripComments(read("lib/emergency/queries.ts"));
const PHI_TABLES = ["emergencyPreArrivals", "symptomSubmissions"];

/** Each `export async function …` body, split at the next export. */
function exportedFunctions(src: string): { name: string; body: string }[] {
  const starts = [...src.matchAll(/export async function (\w+)/g)];
  return starts.map((m, i) => ({
    name: m[1] as string,
    body: src.slice(m.index, starts[i + 1]?.index ?? src.length),
  }));
}

/** The text between a call's parentheses, however deeply they nest. */
function callArgs(src: string, open: number): string {
  let depth = 0;
  let i = open;
  do {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") depth--;
    i++;
  } while (depth > 0 && i < src.length);
  return src.slice(open + 1, i - 1);
}

const libEmergency = readdirSync(resolve(ROOT, "lib/emergency"))
  .filter((f) => f.endsWith(".ts"))
  .map((f) => [`lib/emergency/${f}`, stripComments(read(join("lib/emergency", f)))] as const);

describe("lib/emergency/queries.ts — every PHI read pins the tenant", () => {
  const fns = exportedFunctions(QUERIES);

  it("exports the read models the board, the sheet and the admin form consume", () => {
    expect(fns.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        "fetchIncomingPreArrivals",
        "fetchPreArrivalForBoard",
        "fetchEmergencySheet",
        "fetchEmergencySettings",
        "fetchCatalogVersionStatus",
      ]),
    );
  });

  it("a query that reads a PHI table names facilityId in its where", () => {
    // The board reads go through one shared selector; the where is in each caller.
    for (const f of fns) {
      const readsPhi = PHI_TABLES.some((t) => f.body.includes(`${t}.`));
      if (!readsPhi) continue;
      for (const m of f.body.matchAll(/\.where\(/g)) {
        const args = callArgs(f.body, m.index + m[0].length - 1);
        expect(args, `${f.name} reads PHI without a tenant pin`).toMatch(
          /emergencyPreArrivals\.facilityId,\s*(args\.)?facilityId\b/,
        );
      }
    }
  });

  it("the shared board selector has no where of its own — the pin cannot be forgotten by reuse", () => {
    const shared = QUERIES.slice(
      QUERIES.indexOf("function selectBoardRows"),
      QUERIES.indexOf("}", QUERIES.indexOf("function selectBoardRows")),
    );
    expect(shared).not.toContain(".where(");
  });

  it("symptom_submissions is never read from the web read models (an Edge Function owns it)", () => {
    expect(QUERIES).not.toMatch(/\bsymptomSubmissions\b/);
  });

  it("no writes: the module never updates, inserts or deletes", () => {
    expect(QUERIES).not.toMatch(/db\s*\.\s*(update|insert|delete)\(/);
  });
});

describe("lib/emergency — the descriptive line is never sorted or filtered by symptoms", () => {
  it("no .sort/.filter/.orderBy/.where names symptoms or complaint", () => {
    for (const [path, code] of libEmergency) {
      for (const m of code.matchAll(/\.(sort|filter|orderBy|where)\(/g)) {
        expect(
          callArgs(code, m.index + m[0].length - 1),
          `${path}: ${m[0]} names the complaint`,
        ).not.toMatch(/\b(complaint|symptoms)\b/);
      }
    }
  });
});

describe("lib/emergency — one display join with lib/triage, and only that", () => {
  it("labels.ts is the only file under lib/emergency importing lib/triage, and only discriminators", () => {
    for (const [path, code] of libEmergency) {
      const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] as string);
      const triage = imports.filter((i) => i.includes("lib/triage"));
      if (path === "lib/emergency/labels.ts") {
        expect(triage).toEqual(["@/lib/triage/discriminators"]);
      } else {
        expect(triage, `${path} imports lib/triage`).toEqual([]);
      }
      // The scoring engines proper are never reached from here.
      for (const banned of ["triage/engine", "lib/clerkship", "lib/encounter", "/scoring"]) {
        expect(code, `${path} imports ${banned}`).not.toContain(banned);
      }
    }
  });

  it("labels.ts reads the discriminator LABEL only — never minAcuity, lifeThreat or the engine", () => {
    const code = stripComments(read("lib/emergency/labels.ts"));
    expect(code).toContain("DISCRIMINATOR_BY_CODE.get(code)?.label");
    expect(code).not.toMatch(/\b(minAcuity|lifeThreat|computeTriage|acuity)\b/);
  });
});

describe("the sweeper (PRD §9.5) is the CRON_SECRET route on the daily Hobby cadence", () => {
  const route = read("app/api/cron/sweep-pre-arrivals/route.ts");

  it("is scheduled in vercel.json, daily", () => {
    const crons = (
      JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
    ).crons;
    const entry = crons.find((c) => c.path === "/api/cron/sweep-pre-arrivals");
    expect(entry?.schedule).toBe("0 4 * * *");
  });

  it("checks the bearer, expires open rows, clears location at 72 h, purges PHI at 30 days", () => {
    expect(route).toContain("env.CRON_SECRET");
    expect(route).toContain('status: "expired"');
    expect(route).toContain('inArray(emergencyPreArrivals.status, ["sent", "seen", "ready"])');
    expect(route).toContain("LOCATION_TTL_MS = 72 * HOURS");
    expect(route).toContain("PHI_RETENTION_MS = 30 * 24 * HOURS");
    expect(route).toContain('notInArray(emergencyPreArrivals.status, ["arrived"])');
    expect(route).toContain("freeTextEnc: null");
  });

  it("integrity reports counts and never signs or deletes a version", () => {
    const code = stripComments(route);
    expect(code).toContain("unsignedSubmissions");
    expect(code).toContain("unregisteredSubmissions");
    expect(code).not.toMatch(
      /update\(patientSymptomCatalogVersions\)|delete\(patientSymptomCatalogVersions\)/,
    );
    // The only delete is the outbox purge that rides the 30-day PHI sweep.
    expect(code.match(/\.delete\(/g)).toEqual([".delete("]);
    expect(code).toMatch(/\.delete\(preArrivalOutbox\)/);
  });
});
