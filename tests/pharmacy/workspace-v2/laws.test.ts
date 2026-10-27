import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every file of the new interface: the v2 pieces, the new places and the v2 copy. */
function walk(dir: string): string[] {
  let out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(tsx?|mts)$/.test(f)) out.push(p);
  }
  return out;
}
const exists = (d: string) => {
  try {
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
};
const DIRS = [
  "app/pharmacy/_components/v2",
  "app/pharmacy/today",
  "app/pharmacy/window",
  "app/pharmacy/shelf",
  "app/pharmacy/setup",
  "app/pharmacy/needs-you",
].filter(exists);
const FILES = [
  ...DIRS.flatMap(walk),
  ...readdirSync("content")
    .filter((f) => f.startsWith("pharmacy-workspace-v2"))
    .map((f) => join("content", f)),
  "app/pharmacy/store/page.tsx",
  "app/pharmacy/clinical/page.tsx",
].filter((f) => {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
});

describe("Workspace v2 laws over the new interface", () => {
  it("finds the new files", () => {
    expect(FILES.length).toBeGreaterThan(3);
  });

  it.each(FILES)("%s: red only for the Emergency link, nothing green", (f) => {
    const s = readFileSync(f, "utf8");
    expect(s).not.toMatch(/\b(bg|text|border|ring|fill|stroke)-(red|rose|green|emerald|lime)-\d/);
    expect(s).not.toMatch(/status-(critical|ok|good|success)/);
  });

  it.each(FILES)("%s: no role words (Law 4)", (f) => {
    const s = readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    expect(s).not.toMatch(/\b(Pharmacist|Doctor|Nurse|Pharmacy technician)s?\b/);
  });

  it.each(FILES)("%s: never claims to update live", (f) => {
    expect(readFileSync(f, "utf8")).not.toMatch(/updates live/i);
  });

  it.each(FILES)("%s: no bracketed board placeholders", (f) => {
    expect(readFileSync(f, "utf8")).not.toMatch(/"[^"]*\[(target|dose|strength|frequency|duration)\][^"]*"/i);
  });
});
