/**
 * Scanning (Pharmacy Phase 2, 5.11, 6.10: SC-1 to SC-3; D-PH2-20). Pure. A USB scanner types like a
 * keyboard; a scan that does not parse is treated as typed text. Nothing requires a scan.
 */

const GS = "\u001d";

export type Scan =
  | {
      ok: true;
      gtin: string | null;
      batch: string | null;
      /** ISO date; day `00` gives the month's last day with `expiryMonthOnly` (Phase 1 SL-5). */
      expiry: string | null;
      expiryMonthOnly: boolean;
    }
  | { ok: false; raw: string };

/** GS1 mod-10 check digit over a GTIN-14. */
function gtinOk(g: string): boolean {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(g[13]);
}

/** SC-1: YYMMDD; day 00 means the end of that month. Years are 20YY. */
function expiryOf(v: string): { expiry: string; monthOnly: boolean } | null {
  if (!/^\d{6}$/.test(v)) return null;
  const y = 2000 + Number(v.slice(0, 2));
  const m = Number(v.slice(2, 4));
  const d = Number(v.slice(4, 6));
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  const iso = (day: number) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return d === 0 ? { expiry: iso(last), monthOnly: true } : { expiry: iso(d), monthOnly: false };
}

const FIXED: Readonly<Record<string, number>> = { "01": 14, "17": 6 };
const VARIABLE = new Set(["10", "21"]);

/**
 * SC-1, SC-2: parse a GS1 element string: AI 01 (14 digits), 10 (batch, variable, ended by the group
 * separator, ASCII 29 or the scanner's configured substitute, or the end), 17 (YYMMDD), 21 (serial,
 * read and ignored); in raw or "(01)…(10)…(17)…" form, any AI order, an optional symbology prefix
 * (`]d2`, `]C1`, `]Q3`, …). Any failure returns the raw text.
 */
export function parseGs1(raw: string, opts: { separator?: string } = {}): Scan {
  const fail: Scan = { ok: false, raw };
  let s = raw.trim().replace(/^\][A-Za-z]\d/, "");
  if (opts.separator) s = s.split(opts.separator).join(GS);
  const fields = new Map<string, string>();
  if (s.startsWith("(")) {
    const re = /\((\d{2})\)([^(]*)/gy;
    let m: RegExpExecArray | null;
    let used = 0;
    while ((m = re.exec(s)) !== null) {
      const [, ai, value] = m as unknown as [string, string, string];
      if (fields.has(ai)) return fail;
      fields.set(ai, value.replaceAll(GS, ""));
      used = re.lastIndex;
    }
    if (used !== s.length) return fail;
  } else {
    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) {
        i++;
        continue;
      }
      const ai = s.slice(i, i + 2);
      i += 2;
      if (fields.has(ai)) return fail;
      const len = FIXED[ai];
      if (len !== undefined) {
        fields.set(ai, s.slice(i, i + len));
        i += len;
      } else if (VARIABLE.has(ai)) {
        const end = s.indexOf(GS, i);
        const stop = end === -1 ? s.length : end;
        fields.set(ai, s.slice(i, stop));
        i = stop;
      } else return fail;
    }
  }
  if (
    fields.size === 0 ||
    [...fields.keys()].some((k) => FIXED[k] === undefined && !VARIABLE.has(k))
  )
    return fail;
  const gtin = fields.get("01") ?? null;
  if (gtin !== null && !(/^\d{14}$/.test(gtin) && gtinOk(gtin))) return fail;
  const batch = fields.get("10") ?? null;
  if (batch !== null && !/^[\x21-\x7e]{1,20}$/.test(batch)) return fail;
  const serial = fields.get("21");
  if (serial !== undefined && !/^[\x21-\x7e]{1,20}$/.test(serial)) return fail;
  const e17 = fields.get("17");
  const exp = e17 === undefined ? null : expiryOf(e17);
  if (e17 !== undefined && exp === null) return fail;
  if (gtin === null && batch === null && exp === null) return fail;
  return {
    ok: true,
    gtin,
    batch,
    expiry: exp?.expiry ?? null,
    expiryMonthOnly: exp?.monthOnly ?? false,
  };
}

/** SC-3: a GTIN maps to at most one active product per hospital (0180 `pp_gtin`). */
export function productForGtin(
  products: readonly { id: string; gtin: string | null; active: boolean }[],
  gtin: string,
): { ok: true; productId: string } | { ok: false; reason: "none" | "ambiguous" } {
  const hits = products.filter((p) => p.active && p.gtin === gtin);
  if (hits.length === 0) return { ok: false, reason: "none" };
  if (hits.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, productId: (hits[0] as { id: string }).id };
}
