/**
 * Owner item 1: Add supplier offers MedSync's sourced supplier list. The file parses, every entry names its source
 * and when it was checked, and the dialog offers the list and marks one already added.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import SUPPLIERS from "@/data/pharmacy/suppliers.v1.json";

const Supplier = z.strictObject({
  name: z.string().min(2).max(160),
  shortName: z.string().min(2).max(40),
  kind: z.enum(["public_agency", "pnfp"]),
  website: z.url(),
  source: z.url(),
  checkedOn: z.iso.date(),
});

describe("supplier list (owner item 1)", () => {
  it("parses: only the two sourced suppliers, each with its source and the day it was checked", () => {
    const list = z.array(Supplier).parse(SUPPLIERS.suppliers);
    expect(list.map((s) => s.shortName)).toEqual(["NMS", "JMS"]);
    for (const s of list) {
      expect(s.source).toMatch(/^https:\/\//);
      expect(s.checkedOn).toBe("2026-10-29");
    }
  });

  it("the Add supplier dialog offers the list, marks one already added, and saves through saveCounterparty", () => {
    const src = readFileSync(
      resolve("app/pharmacy/store/places/_components/places-dialogs.tsx"),
      "utf8",
    );
    expect(src).toContain('import SUPPLIERS from "@/data/pharmacy/suppliers.v1.json"');
    expect(src).toContain("SUPPLIERS.suppliers.map");
    expect(src).toContain("L.added");
    expect(src).toContain("actions.saveCounterparty(");
    const body = readFileSync(resolve("app/pharmacy/store/places/body.tsx"), "utf8");
    expect(body).toContain("<CounterpartyDialog added={data.counterparties.map((c) => c.name)} />");
  });
});
