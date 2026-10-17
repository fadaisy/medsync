/**
 * Code 128, subset B (CLSI AUTO02 names Code 128 for specimen barcodes; H23). Pure, no dependency (A7).
 *
 * Subset B covers printable ASCII 32–126, enough for `MF-2026-0141` and `L00000622`. Each symbol is 11 modules
 * (3 bars, 3 spaces); the stop is 13. The checksum is the start value plus each data value times its position,
 * mod 103.
 */

/** Bar/space widths for symbol values 0–106 (106 is the stop, with its final 2-module bar). */
const PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
] as const;

export const START_B = 104;
export const STOP = 106;
export const CODE128_PATTERNS: readonly string[] = PATTERNS;

/** The symbol values: start B, data, checksum, stop. Throws on a character outside 32–126. */
export function code128Values(text: string): number[] {
  if (!text) throw new Error("code128: empty text");
  const data = [...text].map((ch) => {
    const c = ch.codePointAt(0)!;
    if (c < 32 || c > 126)
      throw new Error(`code128: character not in subset B: ${JSON.stringify(ch)}`);
    return c - 32;
  });
  const check = data.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
  return [START_B, ...data, check, STOP];
}

/** Module widths, alternating bar and space, starting with a bar. */
export function code128Bars(text: string): number[] {
  return code128Values(text).flatMap((v) => [...PATTERNS[v]!].map(Number));
}

/** An SVG of the barcode: black bars on white, a 10-module quiet zone each side. */
export function code128Svg(text: string, o: { height?: number; module?: number } = {}): string {
  const h = o.height ?? 40;
  const m = o.module ?? 2;
  const widths = code128Bars(text);
  const quiet = 10;
  const total = widths.reduce((a, b) => a + b, 0) + 2 * quiet;
  let x = quiet;
  const rects: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${x * m}" y="0" width="${w * m}" height="${h}"/>`);
    x += w;
  });
  const label = text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${label}" ` +
    `width="${total * m}" height="${h}" viewBox="0 0 ${total * m} ${h}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="white"/><g fill="black">${rects.join("")}</g></svg>`
  );
}
