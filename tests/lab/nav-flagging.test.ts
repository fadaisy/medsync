import type { LabPermission } from "@/lib/lab/access";
import type { RefEntry } from "@/lib/resus/reference/ref";
import { describe, expect, it } from "vitest";

import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
import { LAB_PERMISSIONS } from "@/lib/lab/access";
import { criticalFlaggingActive } from "@/lib/lab/critical-flagging";
import { LAB_NAV, navFor } from "@/lib/lab/nav";

/** Lab Phase 0 — the navigation registry (NV-1..NV-3) and the flagging seam (CF-1, CF-2 copy). */
describe("lab navigation", () => {
  it("NV-1, NV-3: exactly Worklist, Released today and Rejected, in order", () => {
    expect(LAB_NAV.map((i) => [i.id, i.label, i.href])).toEqual([
      ["worklist", "Worklist", "/lab"],
      ["released", "Released today", "/lab/released"],
      ["rejected", "Rejected", "/lab/rejected"],
    ]);
  });

  it("NV-2: only what the viewer may see", () => {
    expect(navFor(new Set<LabPermission>(LAB_PERMISSIONS))).toHaveLength(3);
    expect(navFor(new Set<LabPermission>())).toEqual([]);
  });
});

describe("critical flagging", () => {
  const ref = (status: "signed" | "pending_cso"): RefEntry =>
    ({ id: "REF-CRIT-X", status }) as unknown as RefEntry;

  it("CF-1: off today — the shipped limits are all pending", () => {
    expect(criticalFlaggingActive("any-hospital")).toBe(false);
  });

  it("CF-1: on only when every limit and the time frame are signed", () => {
    expect(criticalFlaggingActive("h", [ref("signed"), ref("signed")])).toBe(true);
    expect(criticalFlaggingActive("h", [ref("signed"), ref("pending_cso")])).toBe(false);
    expect(criticalFlaggingActive("h", [])).toBe(false);
  });

  it("CF-2: the notice copy is Appendix B, signed by the CSO", () => {
    expect(CRITICAL_FLAGGING_NOTICE.lead).toBe("Automatic critical flagging is off.");
    expect(CRITICAL_FLAGGING_NOTICE.body).toBe(
      "MedSync will not flag critical values at this hospital. Follow the lab's critical-call procedure and phone critical results to the ward.",
    );
    expect(CRITICAL_FLAGGING_NOTICE).toMatchObject({
      status: "signed",
      signedBy: "Fadhul (CSO)",
      signedOn: "2026-10-10",
    });
  });
});
