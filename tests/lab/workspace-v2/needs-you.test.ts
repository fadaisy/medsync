import type { NeedsYouItem } from "@/lib/lab/needs-you";
import { describe, expect, it } from "vitest";

import {
  filterNeedsYou,
  groupNeedsYou,
  orderNeedsYou,
  scopeNeedsYou,
  waited,
} from "@/lib/lab/needs-you";

/** S12 (pure part), NY-2, NY-3: order by group then oldest first; scoped to what the viewer may act on. */
const at = (m: number) => new Date(Date.UTC(2026, 9, 19, 9, m));
const item = (kind: NeedsYouItem["kind"], m: number): NeedsYouItem => ({
  key: `${kind}:${m}`,
  kind,
  title: "",
  patientUserId: null,
  detail: null,
  since: at(m),
  href: "/lab",
});
const all = [
  item("signature", 1),
  item("delta", 5),
  item("alert", 9),
  item("lot", 2),
  item("delta", 3),
  item("match", 0),
];

describe("Needs you", () => {
  it("orders Now, then Waiting on the lab, then Today, oldest first", () => {
    expect(orderNeedsYou(all).map((i) => i.key)).toEqual([
      "alert:9",
      "match:0",
      "delta:3",
      "delta:5",
      "signature:1",
      "lot:2",
    ]);
    expect(groupNeedsYou(all).map((g) => g.group)).toEqual(["now", "lab", "today"]);
  });

  it("a technologist sees no signatures, matches only with resolve, lots only with stock", () => {
    const tech = scopeNeedsYou(all, { manage: false, resolveMatch: false, stock: false });
    expect(tech.map((i) => i.kind).sort()).toEqual(["alert", "delta", "delta"]);
    expect(scopeNeedsYou(all, { manage: true, resolveMatch: true, stock: true })).toHaveLength(6);
  });

  it("filters by place, and says how long in words", () => {
    expect(
      filterNeedsYou(all, "results")
        .map((i) => i.kind)
        .sort(),
    ).toEqual(["alert", "delta", "delta"]);
    expect(filterNeedsYou(all, "setup").map((i) => i.kind)).toEqual(["signature"]);
    expect(waited(at(0), at(12))).toBe("12 min");
    expect(waited(at(0), new Date(at(0).getTime() + 68 * 60_000))).toBe("1 h 08");
    expect(waited(at(0), new Date(at(0).getTime() + 3 * 86_400_000))).toBe("3 days");
  });
});
