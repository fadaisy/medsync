/** SUPPLIES.md, the pure parts: §C filters, §E line checks, §D and §H expiry, the list's identity and the thresholds rule. */
import { readFileSync } from "node:fs";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { describe, expect, it } from "vitest";

import { DELIVERY, fixtureWorld } from "@/app/styleguide/pharmacy-receive/world";
import snapshot from "@/app/styleguide/pharmacy-store/world.json";
import { medicinesFixture } from "@/components/pharmacy/medicines/fixture";
import { RECEIVE_SUPPLY as RS } from "@/content/pharmacy-supplies";
import {
  evalCond,
  flagNames,
  lineMetrics,
  matchesType,
  typeCounts,
} from "@/lib/pharmacy/derive/medicines";
import { lineInfo } from "@/lib/pharmacy/derive/receive";
import { expRows } from "@/lib/pharmacy/derive/store/expiry";
import { fmtExp } from "@/lib/pharmacy/derive/store/format";
import { parseCsv } from "@/lib/pharmacy/supplies/csv";
import { levelOf, levelTooLow, supplyFormOf } from "@/lib/pharmacy/supplies/defaults";
import seed from "@/lib/pharmacy/supplies/seed-items.json";

const payload = medicinesFixture();
const row = (id: string) => {
  const l = payload.lines.find((x) => x.id === id)!;
  return { l, mx: lineMetrics(l, payload.places, null), qc: [] };
};

describe("§C item filters", () => {
  it("H1: 28 supplies (21 health, 7 lab) beside 47 medicines", () => {
    expect(typeCounts(payload.lines)).toEqual({
      all: 75,
      medicine: 47,
      health_supply: 21,
      lab_supply: 7,
    });
    expect(payload.lines.filter((l) => matchesType(l, "lab_supply"))).toHaveLength(7);
  });
  it("filters by type, by the supply sale word and by Sterile and Kit", () => {
    const cond = (col: string, op: string, val: string) => ({ col, op, val }) as never;
    expect(evalCond(cond("itype", "is", "Laboratory supply"), row("mrdt") as never)).toBe(true);
    expect(evalCond(cond("itype", "is", "Medicine"), row("mrdt") as never)).toBe(false);
    expect(
      evalCond(cond("sale", "is", "Supply (issued, not dispensed)"), row("sad5") as never),
    ).toBe(true);
    expect(flagNames(row("sad5").l.flags)).toContain("Sterile");
    expect(flagNames(row("mrdt").l.flags).join()).toMatch(/^Kit, /);
  });
  it("a no-expiry item never counts as expiring", () => {
    expect(row("sbox").mx.exp).toBeNull();
  });
});

describe("§E receiving a supply", () => {
  const w = fixtureWorld();
  const d = w.deliveries.find((x) => x.id === DELIVERY.counting)!;
  const at = (no: number) => d.lines.find((l) => l.no === no)!;
  const info = (no: number, over = {}) => lineInfo({ ...at(no), ...over }, d, w);

  it("a sterile line can't be added until the seal is answered", () => {
    expect(info(7).problems).toContain(RS.seal.missing(7));
    expect(info(7, { seal: "ok" }).problems).toEqual([]);
  });
  it("a broken seal blocks while any accepted packs remain", () => {
    const broken = info(7, { seal: "broken" });
    expect(broken.problems).toContain(RS.seal.problem(7));
    expect(broken.words.map((x) => x.word)).toContain(RS.seal.word);
    const some = { seal: "broken", rejOn: true, rejPacks: "4", rejWhy: "damaged" };
    expect(info(7, some).problems).toContain(RS.seal.problem(7));
    expect(info(7, { ...some, rejPacks: "10" }).problems).toEqual([]);
  });
  it("a kit marked hot blocks until rejected or kept apart", () => {
    expect(info(8).problems).toContain(RS.kit.missing(8));
    expect(info(8, { kitTemp: "hot" }).problems).toContain(RS.kit.problem(8));
    expect(info(8, { kitTemp: "hot" }).words.map((x) => x.word)).toContain(RS.kit.word);
    const apart = { kitTemp: "hot", rejOn: true, rejPacks: "20", rejWhy: "other", rejFate: "quarantine" };
    expect(info(8, apart).problems).toEqual([]);
    expect(info(8, { kitTemp: "ok" }).problems).toEqual([]);
  });
  it("a safety box needs a batch but no expiry, whatever a replayed line holds", () => {
    expect(info(9).problems).toEqual([]);
    expect(info(9, { exp: "garbage" }).problems).toEqual([]);
    expect(info(9, { batch: "" }).problems).not.toEqual([]);
  });
  it("a medicine still needs its expiry", () => {
    const m = info(7, { seal: "ok", exp: "" });
    expect(m.problems.join()).toMatch(/expiry/i);
  });
});

describe("§D expiry in the Main store", () => {
  const world = (snapshot as unknown as { world: StoreWorld }).world;
  it("a no_expiry batch shows no expiry and is never in Expiry or At risk", () => {
    const box = world.meds.find((m) => m.noExpiry)!;
    const b = world.batches.find((x) => x.medId === box.id)!;
    expect(fmtExp(b.exp)).toBe("no expiry");
    const far = { ...world, batches: [{ ...b, exp: "2026-12-01" }], today: "2026-11-05" };
    expect(expRows(far)).toEqual([]);
  });
  it("a test kit warns on its own rule, in days", () => {
    const kit = world.meds.find((m) => m.kit)!;
    const b = world.batches.find((x) => x.medId === kit.id)!;
    const at = (exp: string, kitWarn: number) =>
      expRows({
        ...world,
        today: "2026-11-05",
        rules: { ...world.rules, kitWarn },
        batches: [{ ...b, exp }],
      }).length;
    expect(at("2026-12-20", 60)).toBe(1);
    expect(at("2027-02-20", 60)).toBe(0);
    expect(at("2027-02-20", 120)).toBe(1);
  });
});

describe("the EMHSLU list", () => {
  const csv = parseCsv(readFileSync("data/emhslu-2023-supplies.csv", "utf8"));
  it("every seeded supply is a real row of the parsed list", () => {
    for (const s of seed) {
      expect(
        csv.some((r) => r.name === s.emName && (r.specification ?? "") === (s.emSpec ?? "")),
        s.key,
      ).toBe(true);
    }
    expect(seed).toHaveLength(28);
  });
  it("loads every section and maps every printed level", () => {
    expect(new Set(csv.map((r) => r.section))).toEqual(new Set(["B", "C", "D"]));
    expect(levelOf("HC IV")).toBe("HC4");
    expect(levelOf("NTRL")).toBe("NR");
  });
  it("the catalogue warns only when the hospital's level is lower", () => {
    expect(levelTooLow("RR", "district")).toBe(true);
    expect(levelTooLow("HC3", "district")).toBe(false);
    expect(levelTooLow("NR", "private")).toBe(false);
  });
  it("gives the filter's supply forms", () => {
    expect(supplyFormOf("Syringe AD + needle", "Administration sets")).toBe("Syringe");
    expect(supplyFormOf("Malaria Antigen", "Laboratory: rapid tests")).toBe("Test kit");
    expect(supplyFormOf("Chlorhexidine", "Antiseptics, detergents and disinfectants")).toBe(
      "Disinfectant",
    );
  });
});

describe("thresholds come from the rules", () => {
  it("no hard-coded 60 or 30 °C in the supply code", () => {
    for (const f of [
      "content/pharmacy-supplies.ts",
      "components/pharmacy/medicines/type-switch.tsx",
      "lib/pharmacy/supplies/defaults.ts",
      "lib/pharmacy/derive/store/expiry.ts",
      "lib/pharmacy/derive/receive/line-info.ts",
      "components/pharmacy/receive/count/line-edit.tsx",
      "components/pharmacy/receive/count/picker.tsx",
    ]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/\b30\s*°C|2–30|\bkitWarn\s*[=:]\s*60\b|\b60 days\b/);
    }
  });
});
