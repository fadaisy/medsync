/** EAN-13 (RECEIVE §E1): L/G/R patterns with parity from the first digit, and the in-house `200` codes. */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function checkDigit(d12: string): string {
  let t = 0;
  for (let i = 0; i < 12; i++) t += Number(d12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (t % 10)) % 10);
}

/** The 95 modules of a 13-digit code, `1` a bar and `0` a space. */
export function ean13Bits(code: string): string {
  if (!/^\d{13}$/.test(code)) throw new Error("EAN-13 takes 13 digits");
  const par = PARITY[Number(code[0])]!;
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === "L" ? L : G)[Number(code[i])];
  bits += "01010";
  for (let j = 7; j <= 12; j++) bits += R[Number(code[j])];
  return `${bits}101`;
}

/** Runs of bars and spaces, to draw: width in modules. */
export function ean13Runs(code: string): { bar: boolean; width: number }[] {
  const runs: { bar: boolean; width: number }[] = [];
  for (const c of ean13Bits(code)) {
    const last = runs[runs.length - 1];
    if (last && last.bar === (c === "1")) last.width += 1;
    else runs.push({ bar: c === "1", width: 1 });
  }
  return runs;
}

/** `200` + a nine-digit sequence + its check digit. */
export function inHouseCode(sequence: number): string {
  const d12 = `200${String(sequence).padStart(9, "0")}`;
  return d12 + checkDigit(d12);
}

/** The digits a label prints for a stored GTIN, or null when it cannot be an EAN-13. */
export function labelDigits(gtin: string): string | null {
  const g = gtin.replace(/^0+(?=\d{13}$)/, "");
  if (/^\d{13}$/.test(g)) return g;
  if (/^\d{8,12}$/.test(g)) {
    const d12 = g.padStart(12, "0");
    return g.length === 12 ? d12 + checkDigit(d12) : null;
  }
  return null;
}
