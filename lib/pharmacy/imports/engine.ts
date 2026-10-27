/**
 * Imports, pure (catalogue slice Step 9; ADR 0462). A CSV file (UTF-8, comma, header row; O-5: no Excel) becomes
 * rows; each row gets a match and the reason, and a person decides. A different strength is never proposed (S35);
 * a price-list line matches by code first, and by name only for a person to decide (S37).
 */
import { sameStrength } from "@/lib/pharmacy/catalogue";
import { parseGs1 } from "@/lib/pharmacy/stores/scan";

export type ImportKind = "products" | "opening_stock" | "price_list";
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;

/** RFC 4180: quoted fields, "" inside quotes, CRLF or LF; a BOM is dropped. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f);
      out.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f !== "" || row.length) {
    row.push(f);
    out.push(row);
  }
  return out.filter((r) => r.some((v) => v.trim() !== ""));
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Each kind's fields: the header names accepted for it, and whether it is required (GATE A §8). */
export const COLUMNS: Record<ImportKind, Record<string, { names: string[]; required: boolean }>> = {
  products: {
    name: { names: ["name", "medicineoritemname", "medicine", "item", "itemname"], required: true },
    strength: { names: ["strength", "strengthasprinted"], required: true },
    form: { names: ["form", "doseform"], required: true },
    brand: { names: ["brand", "brandname"], required: false },
    manufacturer: { names: ["manufacturer", "maker"], required: false },
    nda: { names: ["nda", "ndanumber", "registration", "registrationnumber"], required: false },
    pack: { names: ["pack", "packdescription"], required: false },
    contents: { names: ["contents"], required: false },
    issueUnit: { names: ["issueunit"], required: true },
    gtin: { names: ["gtin", "barcode"], required: false },
    supplierCode: { names: ["suppliercode"], required: false },
  },
  opening_stock: {
    place: { names: ["place", "location", "store"], required: true },
    product: { names: ["product", "productname", "productid"], required: true },
    batch: { names: ["batch", "batchnumber"], required: true },
    expiry: { names: ["expiry", "expirydate"], required: true },
    quantity: { names: ["quantity", "quantityinissueunits", "qty"], required: true },
    unitCost: { names: ["unitcost", "cost"], required: false },
  },
  price_list: {
    supplier: { names: ["supplier"], required: true },
    editionDate: { names: ["editiondate", "edition", "date"], required: true },
    itemText: { names: ["itemtext", "item", "description"], required: true },
    packPrice: { names: ["packprice", "price"], required: false },
    supplierCode: { names: ["suppliercode", "code"], required: false },
    gtin: { names: ["gtin", "barcode"], required: false },
  },
};

export type ReadResult =
  | { ok: true; rows: Record<string, string>[] }
  | { ok: false; error: string };

/** The file's rows as fields, or the reason it cannot be read (size, rows, a missing column). */
export function readImport(kind: ImportKind, text: string): ReadResult {
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    return { ok: false, error: "The file is larger than 2 MB. Split it and import each part." };
  const [head, ...body] = parseCsv(text);
  if (!head || body.length === 0)
    return { ok: false, error: "The file has no rows under its header." };
  if (body.length > MAX_ROWS)
    return { ok: false, error: `The file has ${body.length} rows; the most is ${MAX_ROWS}.` };
  const at = head.map(key);
  const cols = COLUMNS[kind];
  const index: Record<string, number> = {};
  const missing: string[] = [];
  for (const [field, c] of Object.entries(cols)) {
    const i = at.findIndex((h) => c.names.includes(h));
    if (i >= 0) index[field] = i;
    else if (c.required) missing.push(c.names[0]!);
  }
  if (missing.length) return { ok: false, error: `A column is missing: ${missing.join(", ")}.` };
  return {
    ok: true,
    rows: body.map((r) =>
      Object.fromEntries(Object.entries(index).map(([f, i]) => [f, (r[i] ?? "").trim()])),
    ),
  };
}

/** Names compared folded: accents dropped, lower case, anything not a letter or digit as one space. */
export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A GTIN typed or scanned, as 14 digits; null when absent; "bad" when it does not check. */
export function gtinOf(v: string | undefined): string | null | "bad" {
  if (!v?.trim()) return null;
  const s = parseGs1(v.trim());
  return s.ok && s.gtin ? s.gtin : "bad";
}

export type Match = "matched" | "check" | "not_in_catalogue" | "invalid";
export interface Judged<P> {
  match: Match;
  why: string;
  proposal: P | null;
}

/** A catalogue medicine as the products import sees it; `formularyId` null means not on the prescribing list. */
export interface CatalogueEntry {
  medicineId: string;
  name: string;
  kind: "medicine" | "health_supply";
  strength: string | null;
  formularyId: string | null;
  packId: string | null;
}
export interface ProductIndex {
  byGtin: ReadonlyMap<string, CatalogueEntry>;
  byName: ReadonlyMap<string, readonly CatalogueEntry[]>;
  /** Packs and `formularyId|strength` the hospital already stocks, so a row never makes a second product. */
  existing: ReadonlySet<string>;
}
export type ProductProposal = CatalogueEntry | { options: CatalogueEntry[] };

const strengthOk = (row: string, e: CatalogueEntry) =>
  e.strength === null ? false : sameStrength(row, e.strength) === "same";
const held = (e: CatalogueEntry, row: string, idx: ProductIndex) =>
  (e.packId !== null && idx.existing.has(e.packId)) ||
  (e.formularyId !== null && idx.existing.has(`${e.formularyId}|${fold(row)}`));

/** One products row (S34, S35). */
export function judgeProduct(
  r: Record<string, string>,
  idx: ProductIndex,
): Judged<ProductProposal> {
  const need = ["name", "strength", "form", "issueUnit"].filter((k) => !r[k]);
  if (need.length) return { match: "invalid", why: `Empty: ${need.join(", ")}.`, proposal: null };
  const g = gtinOf(r.gtin);
  if (g === "bad")
    return {
      match: "invalid",
      why: "The GTIN's check digit is wrong: type it again from the pack.",
      proposal: null,
    };
  const usable = (e: CatalogueEntry, how: string): Judged<ProductProposal> => {
    if (held(e, r.strength!, idx))
      return {
        match: "check",
        why: `${how}: this hospital already has this product.`,
        proposal: null,
      };
    if (e.kind === "medicine" && !e.formularyId)
      return {
        match: "check",
        why: `${how}, but it is not on the prescribing list: medicines off the list wait for the clinical safety officer.`,
        proposal: null,
      };
    return { match: "matched", why: how, proposal: e };
  };
  if (g) {
    const e = idx.byGtin.get(g);
    if (e && strengthOk(r.strength!, e)) return usable(e, "Barcode");
    if (e)
      return {
        match: "check",
        why: `The barcode's pack is ${e.strength ?? "of no stated strength"}, not ${r.strength}. A different strength is never proposed.`,
        proposal: null,
      };
  }
  const named = idx.byName.get(fold(r.name!)) ?? [];
  const same = named.filter((e) => strengthOk(r.strength!, e));
  if (same.length === 1) return usable(same[0]!, "Name and strength");
  if (same.length > 1)
    return {
      match: "check",
      why: "Several catalogue entries have this name and strength: choose one.",
      proposal: { options: same },
    };
  if (named.length)
    return {
      match: "not_in_catalogue",
      why: "Found by name only in another strength. A different strength is never proposed.",
      proposal: null,
    };
  return {
    match: "not_in_catalogue",
    why: "No catalogue entry by this barcode or name.",
    proposal: null,
  };
}

/** `2027-03-31`, or `2027-03` for a pack that gives the month only (its last day). */
export function expiryOfText(v: string): { expiry: string; monthOnly: boolean } | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null];
  if (mo < 1 || mo > 12) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d !== null && (d < 1 || d > last)) return null;
  return { expiry: `${m[1]}-${m[2]}-${String(d ?? last).padStart(2, "0")}`, monthOnly: d === null };
}

export interface HospitalProduct {
  id: string;
  name: string;
  gtins: readonly string[];
}
export interface OpeningProposal {
  productId: string;
  batch: string;
  expiry: string;
  monthOnly: boolean;
  quantity: number;
  unitCost: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One opening-stock row: the place must be the draft's; the product is found by id, barcode or exact name. */
export function judgeOpening(
  r: Record<string, string>,
  placeName: string,
  products: readonly HospitalProduct[],
): Judged<OpeningProposal | { options: OpeningProposal[] }> {
  if (fold(r.place ?? "") !== fold(placeName))
    return {
      match: "invalid",
      why: `This row is for "${r.place}", not ${placeName}.`,
      proposal: null,
    };
  const ex = expiryOfText(r.expiry ?? "");
  if (!r.batch) return { match: "invalid", why: "Empty: batch.", proposal: null };
  if (!ex)
    return { match: "invalid", why: "Give the expiry as 2027-03-31 or 2027-03.", proposal: null };
  if (!/^\d{1,7}$/.test(r.quantity ?? ""))
    return {
      match: "invalid",
      why: "Give the quantity as a whole number of issue units.",
      proposal: null,
    };
  const cost = r.unitCost ? Number(r.unitCost) : null;
  if (cost !== null && !(cost >= 0))
    return { match: "invalid", why: "The unit cost is not a number.", proposal: null };
  const p = r.product!;
  const g = gtinOf(p);
  const hits = UUID.test(p)
    ? products.filter((x) => x.id === p.toLowerCase())
    : g && g !== "bad" && /^\d{8,14}$/.test(p)
      ? products.filter((x) => x.gtins.includes(g))
      : products.filter((x) => fold(x.name) === fold(p));
  const of = (productId: string): OpeningProposal => ({
    productId,
    batch: r.batch!,
    ...ex,
    quantity: Number(r.quantity),
    unitCost: cost,
  });
  if (hits.length > 1)
    return {
      match: "check",
      why: "Several products here have this name: choose one.",
      proposal: { options: hits.map((h) => of(h.id)) },
    };
  if (!hits.length)
    return {
      match: "not_in_catalogue",
      why: "No product here by this name, barcode or id. Add it first.",
      proposal: null,
    };
  return {
    match: "matched",
    why: UUID.test(p) ? "Product id" : g && g !== "bad" ? "Barcode" : "Product name",
    proposal: of(hits[0]!.id),
  };
}

export interface PriceLineProposal {
  packId: string | null;
  productId: string | null;
  packPrice: number | null;
}

/**
 * One supplier price-list line (S37): by GTIN, then by the supplier's code as matched before; by name only as a
 * choice for a person ("check"), never matched by name alone.
 */
export function judgePriceLine(
  r: Record<string, string>,
  supplierName: string,
  idx: {
    byGtin: ReadonlyMap<string, { packId: string; productId: string | null }>;
    bySupplierCode: ReadonlyMap<string, { packId: string; productId: string | null }>;
    byName: ReadonlyMap<string, readonly { packId: string; productId: string | null }[]>;
  },
): Judged<PriceLineProposal | { options: PriceLineProposal[] }> {
  if (fold(r.supplier ?? "") !== fold(supplierName))
    return {
      match: "invalid",
      why: `This line is from "${r.supplier}", not ${supplierName}.`,
      proposal: null,
    };
  if (!r.itemText) return { match: "invalid", why: "Empty: item text.", proposal: null };
  const price = r.packPrice ? Number(r.packPrice.replace(/,/g, "")) : null;
  if (price !== null && !(Number.isInteger(price) && price > 0))
    return {
      match: "invalid",
      why: "Give the pack price in whole shillings above 0.",
      proposal: null,
    };
  const g = gtinOf(r.gtin);
  if (g === "bad")
    return { match: "invalid", why: "The GTIN's check digit is wrong.", proposal: null };
  const by = (h: { packId: string; productId: string | null }) => ({ ...h, packPrice: price });
  const gh = g ? idx.byGtin.get(g) : undefined;
  if (gh) return { match: "matched", why: "Barcode", proposal: by(gh) };
  const ch = r.supplierCode ? idx.bySupplierCode.get(r.supplierCode.toLowerCase()) : undefined;
  if (ch) return { match: "matched", why: "Supplier code, as matched before", proposal: by(ch) };
  const named = idx.byName.get(fold(r.itemText)) ?? [];
  if (named.length)
    return {
      match: "check",
      why: "Found by name: a person decides.",
      proposal: { options: named.map(by) },
    };
  return {
    match: "not_in_catalogue",
    why: "No pack by this barcode, code or name.",
    proposal: { packId: null, productId: null, packPrice: price },
  };
}
