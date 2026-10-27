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
      /** AI 21: kept on the receipt line only (GATE A §6); nothing reads or reports it. */
      serial: string | null;
      /** AI 11, the production date: shown if present, not used. */
      produced: string | null;
      /** Elements read past but not used, by AI ("Part of this code was not read: …"). */
      skipped: string[];
      /** A plain EAN-8, UPC-A, EAN-13 or ITF-14: the pack only; batch and expiry are typed. */
      plain: boolean;
    }
  | { ok: false; raw: string; reason?: "check_digit" };

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

const FIXED: Readonly<Record<string, number>> = { "01": 14, "11": 6, "17": 6 };
const USED = new Set(["01", "10", "11", "17", "21"]);

/**
 * Any other AI, so it can be stepped over (GS1 General Specifications: the AI's digits by its first two, and the
 * element strings with a predefined length). Anything else ends at the separator. A prefix not listed is unreadable.
 */
const AI_DIGITS: Readonly<Record<string, number>> = Object.fromEntries([
  ...["00", "01", "02", "10", "11", "12", "13", "15", "16", "17", "20", "21", "22", "30", "37"].map(
    (p) => [p, 2],
  ),
  ...Array.from({ length: 10 }, (_, i) => [`9${i}`, 2]),
  ...["23", "24", "25", "40", "41", "42"].map((p) => [p, 3]),
  ...["31", "32", "33", "34", "35", "36", "39", "43", "70", "71", "72", "80", "81", "82"].map(
    (p) => [p, 4],
  ),
]);
const PREDEFINED: Readonly<Record<string, number>> = {
  "00": 18,
  "02": 14,
  "03": 14,
  "04": 16,
  "12": 6,
  "13": 6,
  "14": 6,
  "15": 6,
  "16": 6,
  "18": 6,
  "19": 6,
  "20": 2,
  "31": 6,
  "32": 6,
  "33": 6,
  "34": 6,
  "35": 6,
  "36": 6,
  "41": 13,
};

/**
 * SC-1, SC-2, Appendix B: parse a GS1 element string: AI 01 (14 digits), 10 (batch, variable, ended by the group
 * separator, ASCII 29 or the scanner's configured substitute, or the end), 17 (YYMMDD), 21 (serial), 11 (production
 * date); in raw or "(01)…(10)…" form, any AI order, an optional symbology prefix (`]d2`, `]C1`, `]Q3`, …). Any other
 * AI is stepped over and named in `skipped`. A plain 8-, 12-, 13- or 14-digit code is a GTIN, padded to 14. A wrong
 * GTIN check digit is refused with its reason; any other failure returns the raw text.
 */
export function parseGs1(raw: string, opts: { separator?: string } = {}): Scan {
  const fail: Scan = { ok: false, raw };
  let s = raw.trim().replace(/^\][A-Za-z]\d/, "");
  if (opts.separator) s = s.split(opts.separator).join(GS);
  const skipped: string[] = [];
  if (/^(\d{8}|\d{12,14})$/.test(s)) {
    const gtin = s.padStart(14, "0");
    if (!gtinOk(gtin)) return { ok: false, raw, reason: "check_digit" };
    return {
      ok: true,
      gtin,
      batch: null,
      expiry: null,
      expiryMonthOnly: false,
      serial: null,
      produced: null,
      skipped,
      plain: true,
    };
  }
  const fields = new Map<string, string>();
  if (s.startsWith("(")) {
    const re = /\((\d{2,4})\)([^(]*)/gy;
    let m: RegExpExecArray | null;
    let used = 0;
    while ((m = re.exec(s)) !== null) {
      const [, ai, value] = m as unknown as [string, string, string];
      if (fields.has(ai) || skipped.includes(ai)) return fail;
      if (USED.has(ai)) fields.set(ai, value.replaceAll(GS, ""));
      else skipped.push(ai);
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
      if (USED.has(ai)) {
        i += 2;
        if (fields.has(ai)) return fail;
        const len = FIXED[ai];
        if (len !== undefined) {
          fields.set(ai, s.slice(i, i + len));
          i += len;
        } else {
          const end = s.indexOf(GS, i);
          const stop = end === -1 ? s.length : end;
          fields.set(ai, s.slice(i, stop));
          i = stop;
        }
        continue;
      }
      const digits = AI_DIGITS[ai];
      if (digits === undefined) return fail;
      const full = s.slice(i, i + digits);
      if (!/^\d+$/.test(full) || full.length !== digits) return fail;
      skipped.push(full);
      i += digits;
      const len = PREDEFINED[ai];
      if (len !== undefined) i += len;
      else {
        const end = s.indexOf(GS, i);
        i = end === -1 ? s.length : end;
      }
      if (i > s.length) return fail;
    }
  }
  if (fields.size === 0) return fail;
  const gtin = fields.get("01") ?? null;
  if (gtin !== null && !/^\d{14}$/.test(gtin)) return fail;
  if (gtin !== null && !gtinOk(gtin)) return { ok: false, raw, reason: "check_digit" };
  const batch = fields.get("10") ?? null;
  if (batch !== null && !/^[\x21-\x7e]{1,20}$/.test(batch)) return fail;
  const serial = fields.get("21") ?? null;
  if (serial !== null && !/^[\x21-\x7e]{1,20}$/.test(serial)) return fail;
  const e17 = fields.get("17");
  const exp = e17 === undefined ? null : expiryOf(e17);
  if (e17 !== undefined && exp === null) return fail;
  const e11 = fields.get("11");
  const made = e11 === undefined ? null : expiryOf(e11);
  if (e11 !== undefined && made === null) return fail;
  if (gtin === null && batch === null && exp === null) return fail;
  return {
    ok: true,
    gtin,
    batch,
    expiry: exp?.expiry ?? null,
    expiryMonthOnly: exp?.monthOnly ?? false,
    serial,
    produced: made?.expiry ?? null,
    skipped,
    plain: false,
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
