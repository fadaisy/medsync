import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Expected board's week strip and day queue. Source-level, like
 * presence-params: the rules are about what the code may say, and a stubbed
 * database would only prove the stub.
 */
const ROOT = process.cwd();
const queries = readFileSync(resolve(ROOT, "lib/reception/queries.ts"), "utf8");
const strip = readFileSync(resolve(ROOT, "app/reception/_components/day-strip.tsx"), "utf8");

/** The body of one top-level `export async function`, to its closing brace at column 0. */
function fn(name: string): string {
  const start = queries.indexOf(`export async function ${name}(`);
  expect(start, `${name} is exported`).toBeGreaterThan(-1);
  const end = queries.indexOf("\n}\n", start);
  return queries.slice(start, end);
}

describe("fetchExpectedCountsByDay / fetchQueueForDay", () => {
  const bodies = {
    fetchExpectedCountsByDay: fn("fetchExpectedCountsByDay"),
    fetchQueueForDay: fn("fetchQueueForDay"),
  };

  it("bind every presenceAt comparison through ts()", () => {
    for (const [name, src] of Object.entries(bodies)) {
      for (const m of src.matchAll(/\b(?:gte|gt|lte|lt|eq|between)\(presenceAt,\s*([^)]+?)\)/g)) {
        expect(m[1], `${name}: ${m[0]}`).toMatch(/^ts\(/);
      }
    }
    // The queue is windowed on presence at all — a bare arrivedAt window
    // would put a 23:50 declarer who walked in at 08:00 on yesterday's queue.
    expect(bodies.fetchQueueForDay).toMatch(/gte\(presenceAt, ts\(/);
  });

  it("the being-seen subquery binds its window through ts() too", () => {
    const sub = queries.slice(
      queries.indexOf("function beingSeenSql("),
      queries.indexOf("\n}\n", queries.indexOf("function beingSeenSql(")),
    );
    expect(sub).toMatch(/arrivedAt} >= \$\{ts\(start\)\}/);
    expect(sub).toMatch(/arrivedAt} < \$\{ts\(end\)\}/);
  });

  it("never touch an encrypted column or decrypt — codes only, so nothing to audit", () => {
    for (const [name, src] of Object.entries(bodies)) {
      expect(src, `${name} selects an encrypted column`).not.toMatch(/Encrypted/);
      expect(src, `${name} decrypts`).not.toMatch(/decrypt/);
    }
  });

  it("every reception function that decrypts a profile name audits it in the same body", () => {
    // The rule the new functions were held to, checked on the paths that DO reveal.
    for (const name of [
      "fetchDeclaredIntakesToday",
      "searchTodaysBoard",
      "fetchReconciliationCandidates",
      "findPatientsByPhone",
    ]) {
      expect(fn(name), name).toMatch(/auditNameReveals\(/);
    }
    expect(fn("fetchExpectedArrivals")).toMatch(/auditProvisionalReveals\(/);
  });

  it("bucket the queue on the real state vocabulary", () => {
    const src = bodies.fetchQueueForDay;
    for (const s of ["declared", "completed", "cancelled"]) expect(src).toContain(`"${s}"`);
    expect(queries).toMatch(/queueEntries\.state} = 'being_seen'/);
  });
});

describe("DayStrip", () => {
  it("links every cell, the week arrows and Today with ?date=", () => {
    const hrefs = [...strip.matchAll(/href=\{`([^`]+)`\}/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const h of hrefs) expect(h).toMatch(/^\/reception\/expected\?date=\$\{/);
  });

  it("marks the selected day for assistive tech and reads each cell in words", () => {
    expect(strip).toMatch(/aria-current=\{isSelected \? "date" : undefined\}/);
    expect(strip).toMatch(/aria-label=\{`\$\{formatDayKey\(c\.dateKey\)\}/);
    expect(strip).toContain('"nothing expected"');
  });

  it("keeps the counts as words and drops zeros", () => {
    expect(strip).toMatch(/if \(c\.expected\) words\.push\(`\$\{c\.expected\} expected`\)/);
    expect(strip).toMatch(/if \(c\.noShow\) words\.push\(`\$\{c\.noShow\} no-show`\)/);
  });
});
