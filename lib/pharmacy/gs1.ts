/** A pack's code, read: GTIN padded to 14, expiry as YYYY-MM or YYYY-MM-DD, batch and serial. RECEIVE §D1. */
export interface PackCode {
  gtin: string;
  exp: string;
  batch: string;
  serial: string;
}

const expiryOf = (e: string) =>
  e.length === 6
    ? `20${e.slice(0, 2)}-${e.slice(2, 4)}${e.slice(4, 6) === "00" ? "" : `-${e.slice(4, 6)}`}`
    : "";

const GS = "\u001d";

/** `(01)…(17)…(10)…(21)…`, the same without brackets (variable fields end at GS), or a plain 8–14 digit code. */
export function parseCode(raw: string): PackCode | null {
  const v = raw.trim();
  if (v.startsWith("(")) {
    const ai: Record<string, string> = {};
    for (const m of v.matchAll(/\((\d{2})\)([^(]*)/g)) ai[m[1]!] = m[2]!;
    if (!ai["01"]) return null;
    return {
      gtin: ai["01"].padStart(14, "0"),
      exp: expiryOf(ai["17"] ?? ""),
      batch: ai["10"] ?? "",
      serial: ai["21"] ?? "",
    };
  }
  if (/^\d{8,14}$/.test(v)) return { gtin: v.padStart(14, "0"), exp: "", batch: "", serial: "" };
  if (!v.startsWith("01") || !/^\d{14}$/.test(v.slice(2, 16))) return null;
  const code: PackCode = { gtin: v.slice(2, 16), exp: "", batch: "", serial: "" };
  let rest = v.slice(16);
  while (rest) {
    const ai = rest.slice(0, 2);
    if (ai === "17") {
      code.exp = expiryOf(rest.slice(2, 8));
      rest = rest.slice(8);
    } else if (ai === "10" || ai === "21") {
      const end = rest.indexOf(GS);
      const value = end < 0 ? rest.slice(2) : rest.slice(2, end);
      if (ai === "10") code.batch = value;
      else code.serial = value;
      rest = end < 0 ? "" : rest.slice(end + 1);
    } else return null;
  }
  return code;
}
