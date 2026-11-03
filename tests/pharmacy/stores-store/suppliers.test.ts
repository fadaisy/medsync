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
  kind: z.enum([
    "public_agency",
    "pnfp",
    "private_wholesaler",
    "manufacturer",
    "international_procurement",
  ]),
  country: z.string().min(2).max(40),
  region: z.enum(["uganda", "africa", "international"]),
  website: z.url(),
  source: z.url(),
  checkedOn: z.iso.date(),
});

describe("supplier list (owner item 1)", () => {
  it("parses: every supplier names its source and the day it was checked, Uganda first", () => {
    const list = z.array(Supplier).parse(SUPPLIERS.suppliers);
    expect(list.slice(0, 2).map((s) => s.shortName)).toEqual(["NMS", "JMS"]);
    expect(new Set(list.map((s) => s.region))).toEqual(
      new Set(["uganda", "africa", "international"]),
    );
    expect(new Set(list.map((s) => s.name)).size).toBe(list.length);
    for (const s of list) {
      expect(s.source).toMatch(/^https:\/\//);
      expect(s.checkedOn).toBe("2026-10-31");
    }
  });

  it("the Add supplier dialog offers the list, marks one already added, and saves through saveCounterparty", () => {
    const src = readFileSync(
      resolve("app/pharmacy/store/places/_components/places-dialogs.tsx"),
      "utf8",
    );
    expect(src).toContain('import SUPPLIERS from "@/data/pharmacy/suppliers.v1.json"');
    expect(src).toContain(".filter((s) => s.region === region)");
    expect(src).toContain("L.added");
    expect(src).toContain("actions.saveCounterparty(");
    const body = readFileSync(resolve("app/pharmacy/setup/_components/place-extras.tsx"), "utf8");
    expect(body).toContain("<CounterpartyDialog added={data.counterparties.map((c) => c.name)} />");
  });
});
