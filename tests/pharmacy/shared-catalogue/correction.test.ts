import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { correctionChanges, sameFacts } from "@/lib/pharmacy/shared-catalogue/correction";

const labels = {
  forms: new Map([
    ["tablet", "Tablet"],
    ["capsule", "Capsule"],
  ]),
  routes: new Map([
    ["oral", "Oral"],
    ["intravenous", "Intravenous"],
  ]),
};

describe("a correction to a medicine (owner item 10)", () => {
  it("says each changed field in words, from the signed labels", () => {
    expect(
      correctionChanges(
        {
          before: { formCode: null, routes: [] },
          after: { formCode: "tablet", routes: ["oral", "intravenous"] },
        },
        labels,
        "None",
      ),
    ).toEqual([
      { field: "form", from: "None", to: "Tablet" },
      { field: "routes", from: "None", to: "Intravenous, Oral" },
    ]);
  });

  it("route order does not make a change", () => {
    const a = { formCode: "tablet", routes: ["oral", "intravenous"] };
    const b = { formCode: "tablet", routes: ["intravenous", "oral"] };
    expect(sameFacts(a, b)).toBe(true);
    expect(correctionChanges({ before: a, after: b }, labels, "None")).toEqual([]);
  });

  it("is reviewed one by one: never in a batch, and listed on its own", () => {
    const q = readFileSync("lib/pharmacy/shared-catalogue/queue.ts", "utf8");
    expect(q).toMatch(/p\.kind = \$\{kind\} AND p\.kind <> 'correction'/);
    expect(q).toMatch(/p\.kind NOT IN \('new_barcode', 'correction'\)/);
  });

  it("the Edit writes a proposal and nothing else", () => {
    const a = readFileSync("app/pharmacy/catalogue-actions.ts", "utf8");
    expect(a).toMatch(/proposeCorrection\(ctx\.tx, ctx\.actor, input\)/);
    expect(a).not.toMatch(/applyCorrection/);
  });
});
