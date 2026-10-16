/** ST-2: the engine's lot transitions are exactly the database trigger's (0112), so neither drifts alone. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LOT_TRANSITIONS } from "@/lib/lab/stock";

describe("ST-2 lot transitions, engine = database", () => {
  it("lists the same pairs as the 0112 trigger", () => {
    const sql = readFileSync("supabase/migrations/0112_lab_stock.sql", "utf8");
    const block = sql.slice(
      sql.indexOf("NOT IN (("),
      sql.indexOf("THEN", sql.indexOf("NOT IN ((")),
    );
    const db = [...block.matchAll(/\('(\w+)','(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const engine = Object.entries(LOT_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
      .sort();
    expect(db.length).toBeGreaterThan(0);
    expect(engine).toEqual(db);
  });
});
