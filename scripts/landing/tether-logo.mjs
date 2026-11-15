// The Tether logo files, from the one mark: the nav's wordmark (Figtree 700, tracking -0.03em, the landing's
// `Wordmark`) outlined once with fontTools + HarfBuzz from the Figtree file the site serves. The tab icon is
// its own "T"; sizes that can carry the word (the sharing card) get all of it. Colours are the Tide tokens'
// values, read from apps/tether-site/app/pw-tokens.css. Writes the same files to the hospital app's /tether
// and to apps/tether-site (tests/tether-landing/site.test.ts fails if they drift). Run from the repo root:
//   node scripts/landing/tether-logo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const T = "M224.2 950V375.2H14.2V250H570.2V375.2H360.8V950Z";
const WORD = readFileSync(new URL("./tether-wordmark.path", import.meta.url), "utf8").trim();

const tokens = readFileSync("apps/tether-site/app/pw-tokens.css", "utf8");
const token = (name) => [...tokens.matchAll(new RegExp(`--pw-${name}: (#[0-9a-f]{6});`, "g"))];
const [ink, inkDark] = token("ink").map((m) => m[1]);
const [surface] = token("surface").map((m) => m[1]);

// The T is 556 wide and 700 tall (cap height); a square box centres it.
const square = (pad) => `${-57.8 - pad} ${250 - pad} ${700 + 2 * pad} ${700 + 2 * pad}`;

// Tab icon: the T alone, ink on the page's own colour, following the browser's theme.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${square(0)}"><style>path{fill:${ink}}@media (prefers-color-scheme:dark){path{fill:${inkDark}}}</style><path d="${T}"/></svg>\n`;

// Bitmaps cannot follow the theme: the T in ink on a surface tile, which reads on light and dark tab bars.
const tile = (pad, radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${square(pad)}"><rect x="${-57.8 - pad}" y="${250 - pad}" width="${700 + 2 * pad}" height="${700 + 2 * pad}" rx="${radius}" fill="${surface}"/><path d="${T}" fill="${ink}"/></svg>`;

// Sharing card, 1200 × 630: the whole word, 300 px wide per 100 px of cap height, centred.
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${surface}"/><g transform="translate(${600 - (2800 / 2) * 0.24} ${315 - 350 * 0.24}) scale(0.24) translate(-14.2 -250)"><path d="${WORD}" fill="${ink}"/></g></svg>`;

const png = (svg, w, h = w) => sharp(Buffer.from(svg)).resize(w, h).png().toBuffer();
const files = {
  "icon.svg": Buffer.from(iconSvg),
  "icon.png": await png(tile(110, 160), 64),
  "apple-icon.png": await png(tile(150, 0), 180),
  "opengraph-image.png": await png(card, 1200, 630),
  "opengraph-image.alt.txt": Buffer.from("Tether"),
};
for (const dir of ["app/tether", "apps/tether-site/app"])
  for (const [name, data] of Object.entries(files)) writeFileSync(`${dir}/${name}`, data);
