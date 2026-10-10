import type * as CheckState from "@/lib/pharmacy/check-state";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * S15 / CS-3, CS-4: with the counts unavailable the notice uses the wording without numbers; with
 * everything done it does not render at all. The check state is stubbed; the notice is the shipped one.
 */
const state = vi.hoisted(() => ({
  value: {
    dispensingRecorded: false,
    interactionsChecked: false,
    doseReferences: null as { signed: number; total: number } | null,
  },
}));
vi.mock("@/lib/pharmacy/check-state", async (orig) => ({
  ...(await orig<typeof CheckState>()),
  pharmacyChecksState: () => state.value,
}));

const { PharmacyNotice } = await import("@/app/pharmacy/_components/pharmacy-notice");

describe("the pharmacy notice", () => {
  it("without counts: the wording without numbers", () => {
    const html = renderToStaticMarkup(h(PharmacyNotice, { hospitalId: "h1" }));
    expect(html).toContain("its dose references are still being signed");
    expect(html).not.toMatch(/\d+ of the \d+/);
  });

  it("with everything done it does not render", () => {
    state.value = {
      dispensingRecorded: true,
      interactionsChecked: true,
      doseReferences: { signed: 5, total: 5 },
    };
    expect(renderToStaticMarkup(h(PharmacyNotice, { hospitalId: "h1" }))).toBe("");
  });
});
