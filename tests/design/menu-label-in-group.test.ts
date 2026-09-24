import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Base UI's Menu.GroupLabel (our DropdownMenuLabel) throws "MenuGroupContext is
 * missing" (production error #31) outside a Menu.Group, which takes the whole
 * page down on open — it did on the resus desk's compressor swap. Source-level:
 * every file that renders a DropdownMenuLabel opens at least as many groups.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("DropdownMenuLabel sits inside a group", () => {
  it("every file opens a DropdownMenuGroup / RadioGroup for each DropdownMenuLabel", () => {
    const bad = ["app", "components"]
      .flatMap((d) => walk(join(process.cwd(), d)))
      .filter((f) => !f.includes("/components/ui/"))
      .filter((f) => {
        const s = readFileSync(f, "utf8");
        const labels = count(s, /<DropdownMenuLabel\b/g);
        const groups = count(s, /<DropdownMenu(Radio)?Group\b/g);
        return labels > groups;
      });
    expect(bad).toEqual([]);
  });
});
