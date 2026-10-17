import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Laws L3 and the colour rule, held by a scan of the Tide code
 * (`src/app`, `src/features`, `src/components/tide`):
 *
 * - no hex, rgb or rgba literal: colours come from the roles in `theme/tide.ts`
 *   (illustration art lives with its fixture in `src/data`);
 * - red (`t.emergency`, `t.emergencyBand`, `t.critical`) only in the files
 *   that draw Help, SOS, the danger interrupt and danger reading states.
 *
 * Legacy screens not yet rebuilt in Tide use the Chroma palette and are not
 * Tide code; they do not touch these roles.
 */
const SRC = join(__dirname, "..");
const ROOTS = ["app", "features", "components/tide"];

/** Where red is the point. Adding a file here is a clinical-safety review. */
const RED_ALLOWED = new Set([
  "app/help.tsx",
  "app/(app)/danger.tsx",
  "app/(app)/care/reading.tsx",
  "app/(app)/care/trends.tsx",
  "features/care/week-chart.tsx",
  "features/home/reading-sheet.tsx",
  "components/tide/primitives.tsx",
  "components/tide/field.tsx",
  "components/tide/screen.tsx",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const all = ROOTS.flatMap((r) => files(join(SRC, r))).map((p) => ({
  file: relative(SRC, p),
  src: readFileSync(p, "utf8"),
}));

/** Comments may name a colour; code may not. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const RAW = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
const RED = /\bt\.(emergency|emergencyBand|critical)\b/;

describe("colour laws", () => {
  it("scans the Tide code", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(all.map((f) => [f.file, f.src]))("%s has no raw colour", (_file, src) => {
    expect(code(src).match(RAW)?.[0] ?? null).toBeNull();
  });

  it.each(all.filter((f) => RED.test(code(f.src))).map((f) => [f.file]))(
    "%s may use red",
    (file) => {
      expect(RED_ALLOWED.has(file)).toBe(true);
    },
  );

  it("catches a raw colour and stray red", () => {
    expect(RAW.test(`color: "#dc2626"`)).toBe(true);
    expect(RED.test(code(`backgroundColor: t.emergency`))).toBe(true);
    expect(RED.test(code(`// t.emergency in a comment`))).toBe(false);
  });
});
