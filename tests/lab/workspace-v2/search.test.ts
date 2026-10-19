import { describe, expect, it } from "vitest";

import { classify, goEntries, scannedOpens } from "@/lib/lab/search";

/** SR-1, S3: what a query is, and a scanned label opening its specimen at once. */
describe("Scan or search", () => {
  it("classifies labels, manifests, hospital numbers and names", () => {
    expect(classify("L00000622")).toBe("label");
    expect(classify("MF-2026-0141")).toBe("manifest");
    expect(classify("MS-2026-00004")).toBe("mrn");
    expect(classify("bos")).toBe("name");
    expect(classify("bo")).toBe("none");
    expect(classify("")).toBe("none");
  });

  it("opens a scanned label with one live hit; never a voided one, never a name", () => {
    expect(scannedOpens("label", [{ voided: false, id: 1 }])).toEqual({ voided: false, id: 1 });
    expect(scannedOpens("label", [{ voided: true }, { voided: false }])).toEqual({ voided: false });
    expect(scannedOpens("label", [{ voided: false }, { voided: false }])).toBeNull();
    expect(scannedOpens("name", [{ voided: false }])).toBeNull();
  });

  it("goes to every visible tab, by its words", () => {
    const tabs = {
      today: [],
      bench: [],
      send_outs: [],
      quality: [{ place: "quality" as const, key: "stock", href: "/lab/quality?tab=stock", from: [] }],
      reports: [],
      setup: [],
    };
    const go = goEntries(tabs, () => "Stock and lots", () => "Quality", "stock");
    expect(go).toEqual([{ label: "Quality · Stock and lots", place: "quality", href: "/lab/quality?tab=stock" }]);
  });
});
