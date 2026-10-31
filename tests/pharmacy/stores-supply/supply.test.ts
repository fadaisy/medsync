/**
 * Pharmacy Phase 2, lane C, pure: the signed packs' schemas (Law 6: nothing defaults), the recall message and the
 * banned-term scan (S32), VEN trimming and its confirmations (S40), the unconfirmed-columns words (S41), the order
 * module never reaching the network (S43), the database's SL-14 words, and the month-end row sentence.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_PACK_TEXT as PACK_TEXT } from "@/content/pharmacy-network";
import { STORES_B } from "@/content/pharmacy-stores";
import { CSO_ALONE, MONTH_END } from "@/content/pharmacy-stores-supply";
import { bannedTermsScan } from "@/lib/pharmacy/messages";
import { countMonth } from "@/lib/pharmacy/stores/month-end-read";
import { confirmCutRefusal, trimToBudget } from "@/lib/pharmacy/stores/order";
import { quantitiesText } from "@/lib/pharmacy/stores/order-store";
import {
  PACK_KINDS,
  PACK_SCHEMAS,
  parsePack,
  PHASE2_KINDS,
  signerRoles,
  templateScan,
} from "@/lib/pharmacy/stores/packs";
import { guardWords } from "@/lib/pharmacy/stores/supply-action";

describe("signed packs (Appendix D, Law 6)", () => {
  it("every Phase 2 kind of 0181 has a schema, words and signers", () => {
    expect(PHASE2_KINDS).toEqual([
      "order_parameters",
      "tracer_list",
      "cart_lookahead",
      "month_end_rules",
      "ward_rules",
      "stores_reason_lists",
      "hmis_column_maps",
      "recall_template",
      "stockout_day_rule",
    ]);
    for (const k of PACK_KINDS) {
      expect(PACK_SCHEMAS[k]).toBeDefined();
      expect(PACK_TEXT[k].signers).toHaveLength(2);
    }
  });

  it("nothing defaults: an empty pack of every kind is refused (stores_reason_lists and hmis maps accept an empty map only explicitly)", () => {
    for (const k of PACK_KINDS) expect(parsePack(k, {}).ok, k).toBe(false);
    expect(parsePack("stores_reason_lists", { lists: {} }).ok).toBe(true);
  });

  it("order parameters: every figure typed; the emergency point is a number or 'not kept'", () => {
    const p = {
      cycleMonths: 2,
      maxMonths: 4,
      minMonths: null,
      emergencyOrderPointMonths: "not_kept",
      reviewWindowMonths: 6,
      minHistoryDays: 90,
      unclassedTrimAs: "N",
      budgetSource: null,
    };
    expect(parsePack("order_parameters", p).ok).toBe(true);
    const { maxMonths: _drop, ...noMax } = p;
    expect(parsePack("order_parameters", noMax).ok).toBe(false);
    expect(parsePack("order_parameters", { ...p, maxMonths: 0 }).ok).toBe(false);
  });

  it("lane B reads ward_rules.allocationRule and cart_lookahead.days", () => {
    expect(
      parsePack("ward_rules", { confirmationWindowHours: 48, allocationRule: "first_expiry" }),
    ).toMatchObject({
      ok: true,
      content: { allocationRule: "first_expiry", confirmationWindowHours: 48 },
    });
    expect(parsePack("cart_lookahead", { days: 30 })).toMatchObject({
      ok: true,
      content: { days: 30 },
    });
  });

  it("D-PH2-22: the CSO alone signs with the exception text; otherwise the two named roles", () => {
    expect(CSO_ALONE).toBe("CSO signs alone");
    expect(signerRoles("recall_template", true)).toEqual(["CSO", null]);
    expect(signerRoles("recall_template", false)).toEqual(["CSO", "Pharmacist reviewer"]);
  });
});

describe("S32: the recall message names no medicine, batch, condition, clinic or prescriber (Law 12)", () => {
  it("Appendix B's text passes the banned-term scan once filled", () => {
    expect(bannedTermsScan(STORES_B.recallPatientMessage("Lane Hospital", "0700000000"))).toEqual(
      [],
    );
    expect(
      templateScan(
        "{messageName} pharmacy needs to speak to you about a medicine you collected. Please call {phone}.",
      ),
    ).toEqual([]);
  });
  it("a template naming a medicine, a batch-like dose or a restricted class is refused", () => {
    expect(
      templateScan("{messageName}: your amoxicillin is recalled. Call {phone}.").length,
    ).toBeGreaterThan(0);
    expect(templateScan("{messageName}: the 500 mg tablets. Call {phone}.").length).toBeGreaterThan(
      0,
    );
    expect(
      templateScan("{messageName}: a controlled medicine. Call {phone}.").length,
    ).toBeGreaterThan(0);
    expect(
      parsePack("recall_template", {
        body: "{messageName}: amoxicillin recalled, call {phone} now.",
      }).ok,
    ).toBe(false);
  });
});

describe("S40: VEN trimming proposes cuts in order and cuts nothing without confirmation", () => {
  const lines = [
    { productId: "v", ven: "V" as const, units: 100, unitPrice: 1, packSize: null },
    { productId: "e", ven: "E" as const, units: 100, unitPrice: 1, packSize: null },
    { productId: "n", ven: "N" as const, units: 100, unitPrice: 1, packSize: null },
  ];
  it("necessary first, then essential; vital is never cut (rework scenario 10)", () => {
    const t = trimToBudget(lines, 50, "N");
    if ("missing" in t) throw new Error("unexpected");
    expect(t.cuts.map((c) => c.productId)).toEqual(["n", "e"]);
    expect(t.totalAfter).toBe(100);
    expect(confirmCutRefusal(t.cuts[0]!, null)).toBeNull();
  });
  it("with a price unknown nothing is trimmed", () => {
    expect(trimToBudget([{ ...lines[0]!, unitPrice: null }], 10, "N")).toMatchObject({
      missing: ["price"],
    });
  });
});

describe("S41, S43: prints and nothing sent", () => {
  it("a form whose columns are not confirmed says so", () => {
    expect(STORES_B.columnsUnconfirmed("HMIS 085")).toBe(
      "Columns not yet confirmed against this hospital's HMIS 085.",
    );
    expect(STORES_B.columnsUnconfirmed("HMIS 084B")).toMatch(/HMIS 084B\.$/);
  });
  it("the copied quantities are plain text, product and quantity", () => {
    expect(quantitiesText([{ name: "Fixture tablet", units: 300, unit: "tablet" }])).toBe(
      "Fixture tablet\t300 tablet",
    );
  });
  it("no file of the order module reaches the network", () => {
    const files = [
      "lib/pharmacy/stores/order.ts",
      "lib/pharmacy/stores/order-read.ts",
      "lib/pharmacy/stores/order-store.ts",
      "app/pharmacy/store/orders/actions.ts",
      "app/pharmacy/store/orders/body.tsx",
      "app/pharmacy/store/orders/_components/order-forms.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, "../../..", f), "utf8");
      expect(src, f).not.toMatch(
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\/|sendBeacon|smsSender|nodemailer/,
      );
    }
  });
});

describe("words and attribution", () => {
  it("SL-14's refusal from the database comes back in words", () => {
    const e = new Error("Failed query", {
      cause: new Error("pharmacy_stock: batch RC-1 is recalled"),
    });
    expect(guardWords(e)).toBe(
      "Batch RC-1 is recalled. It moves only into quarantine or back to the supplier.",
    );
    expect(guardWords(new Error("pharmacy_stock: batch Q-1 is in quarantine"))).toMatch(
      /in quarantine/,
    );
    expect(guardWords(new Error("other"))).toBeNull();
  });
  it("a month-end count up to 15 days into the next month closes the month before", () => {
    expect(countMonth(new Date("2026-09-30T15:00:00+03:00"))).toBe("2026-09-01");
    expect(countMonth(new Date("2026-10-03T10:00:00+03:00"))).toBe("2026-09-01");
    expect(countMonth(new Date("2026-10-20T10:00:00+03:00"))).toBe("2026-10-01");
  });
  it("a reconciliation row reads as a sentence (Section 10)", () => {
    expect(MONTH_END.rowSentence("Ceftriaxone injection 1 g", 260, 230, -30, "not explained")).toBe(
      "Ceftriaxone injection 1 g: should be 260, counted 230, 30 fewer, not explained",
    );
  });
});
