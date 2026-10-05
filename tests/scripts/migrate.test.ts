/**
 * The migrator's two decisions (scripts/migrate.ts): which env file a run reads (a worktree has no
 * .env.local, so the main checkout's), and what it says when nothing is new (the folder, its newest
 * migration, the database's newest, and whether the folder is behind). The case that caused "No new
 * migrations" every time: the main folder on an older branch, the new file only in a worktree.
 */
import { describe, expect, it } from "vitest";

import { envFiles, nothingNewWords, planMigrations } from "@/scripts/migrate";

const at =
  (...paths: string[]) =>
  (p: string) =>
    paths.includes(p);

describe("envFiles", () => {
  it("a folder with its own env files reads them, .env before .env.local", () => {
    expect(envFiles("/m", "/m", at("/m/.env", "/m/.env.local"))).toEqual([
      "/m/.env",
      "/m/.env.local",
    ]);
  });
  it("a worktree without one reads the main checkout's", () => {
    expect(envFiles("/w", "/m", at("/m/.env.local"))).toEqual(["/m/.env.local"]);
  });
  it("a worktree with its own keeps its own; outside git there is no fallback", () => {
    expect(envFiles("/w", "/m", at("/w/.env.local", "/m/.env.local"))).toEqual(["/w/.env.local"]);
    expect(envFiles("/w", null, at("/m/.env.local"))).toEqual([]);
  });
});

describe("planMigrations and the words when nothing is new", () => {
  const applied = new Set(["0080_a.sql", "0081_b.sql", "0090_ward_builder.sql"]);

  it("the main folder on an older branch: nothing pending, and it says the folder is behind", () => {
    const plan = planMigrations(["0080_a.sql", "0081_b.sql", "README.md"], applied);
    expect(plan).toEqual({
      pending: [],
      appliedElsewhere: ["0090_ward_builder.sql"],
      newestHere: "0081_b.sql",
      newestApplied: "0090_ward_builder.sql",
    });
    const words = nothingNewWords(plan, "/Users/x/medsync", "feat/booking-app").join("\n");
    expect(words).toMatch(/branch feat\/booking-app/);
    expect(words).toMatch(/newest migration here: +0081_b\.sql/);
    expect(words).toMatch(/newest applied in the database: 0090_ward_builder\.sql/);
    expect(words).toMatch(/this folder is behind/);
  });

  it("the worktree that holds the new file: it is pending, in order", () => {
    const plan = planMigrations(
      ["0091_encounter_closure.sql", "0080_a.sql", "0081_b.sql", "0090_ward_builder.sql"],
      applied,
    );
    expect(plan.pending).toEqual(["0091_encounter_closure.sql"]);
    expect(plan.appliedElsewhere).toEqual([]);
  });

  it("up to date: no 'behind' line", () => {
    const plan = planMigrations(["0080_a.sql", "0081_b.sql", "0090_ward_builder.sql"], applied);
    expect(nothingNewWords(plan, "/w", null).join("\n")).not.toMatch(/behind/);
  });
});
