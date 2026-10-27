import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Section 8 and Appendix A for ward stock and carts: every action names its permission (pharmacy side) or
 * its hub right (the ward's side). A nurse holds no pharmacy permission (PA2-5): the nurse actions go only
 * through `withLocationRight`. Every pop-up is a centred EditorDialog (ADR 0161); no native date input;
 * no red (Law 13).
 */
/** A page reads with its body (Workspace v2 moved old page bodies to a sibling body.tsx). */
const read = (p: string) => {
  const f = resolve(process.cwd(), p);
  const body = f.replace(/page\.tsx$/, "body.tsx");
  return readFileSync(f, "utf8") + (f.endsWith("page.tsx") && existsSync(body) ? readFileSync(body, "utf8") : "");
};
const exportsOf = (src: string) =>
  [...src.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]!);
const permissionOf = (src: string, name: string) => {
  const body = src.slice(src.indexOf(`export async function ${name}`)).split("\nexport ")[0]!;
  return body
    .match(/"(pharmacy\.(?:manage|stock|store))"|"(ward_act|ward_confirm)"/)
    ?.slice(1)
    .find(Boolean);
};

describe("ward and cart actions name their permission or right", () => {
  it("pharmacy side: wards", () => {
    const src = read("app/pharmacy/store/wards/actions.ts");
    expect(Object.fromEntries(exportsOf(src).map((n) => [n, permissionOf(src, n)]))).toEqual({
      createWardLocation: "pharmacy.manage",
      setWardSupplyModel: "pharmacy.manage",
      setWardLevels: "pharmacy.manage",
      attestWardSigner: "pharmacy.manage",
      signWardLevels: "pharmacy.manage",
      recordWardCount: "pharmacy.stock",
      raiseWardRequisition: "pharmacy.store",
    });
  });
  it("pharmacy side: carts", () => {
    const src = read("app/pharmacy/store/carts/actions.ts");
    expect(Object.fromEntries(exportsOf(src).map((n) => [n, permissionOf(src, n)]))).toEqual({
      createCartLocation: "pharmacy.manage",
      setCartList: "pharmacy.manage",
      attestCartSigner: "pharmacy.manage",
      signCartList: "pharmacy.manage",
      attestCartConfirmer: "pharmacy.stock",
      recordCartCheck: "pharmacy.stock",
      reportCartSealBroken: "pharmacy.stock",
    });
  });
  it("the ward's side: hub rights only, never a pharmacy permission", () => {
    const src = read("app/nurse/ward-stock/actions.ts");
    expect(Object.fromEntries(exportsOf(src).map((n) => [n, permissionOf(src, n)]))).toEqual({
      recordWardCount: "ward_act",
      raiseWardRequisition: "ward_act",
      returnWardStock: "ward_act",
      attestOwnFactor: "ward_confirm",
      confirmWardReceipt: "ward_confirm",
      recordGapReason: "ward_act",
      reportSealBroken: "ward_act",
    });
    expect(src).not.toMatch(
      /runPharmacyWrite|requirePharmacyActor|"pharmacy\.(manage|stock|store|view)"/,
    );
    expect(src).toContain("withLocationRight");
  });
  it("pages gate on their flag; pop-ups are centred dialogs; no native date input; no red", () => {
    for (const p of [
      "app/pharmacy/store/wards/page.tsx",
      "app/pharmacy/store/wards/[locationId]/page.tsx",
      "app/nurse/ward-stock/page.tsx",
    ])
      expect(read(p)).toMatch(/pharmacyWardStockLiveFor\(\w+\.hospitalId\)\) notFound\(\)/);
    for (const p of [
      "app/pharmacy/store/carts/page.tsx",
      "app/pharmacy/store/carts/[locationId]/page.tsx",
    ])
      expect(read(p)).toMatch(/pharmacyCartsLiveFor\(actor\.hospitalId\)\) notFound\(\)/);
    for (const p of [
      "app/pharmacy/store/wards/_components/ward-dialogs.tsx",
      "app/pharmacy/store/wards/_components/ward-stock-view.tsx",
      "app/pharmacy/store/carts/_components/cart-check.tsx",
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(
        /type="date"|type="month"|Sheet\b(?!Body|Header|Footer|Title|Description)|Drawer|side=/,
      );
      expect(src, p).not.toMatch(/\bred-|critical|green-|emerald/);
    }
  });
  it("the nurse nav shows Ward stock only with the flag and a ward right", () => {
    expect(read("app/nurse/_lib/features.ts")).toMatch(
      /slug: "ward-stock",[\s\S]*?flag: "ward_stock"/,
    );
    expect(read("app/nurse/layout.tsx")).toContain("wardStock: await nurseHoldsWardRight(scope)");
    expect(read("lib/nurse/ward-stock.ts")).toMatch(
      /if \(!pharmacyWardStockLiveFor\(scope\.hospitalId\)\) return false;/,
    );
  });
});
