import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SIDEBAR_CLASS was exported from the "use client" sidebar-nav. A server shell that built a string
 * from it got the client reference's text, not the classes: the sidebar lost `hidden` and showed on
 * phones (found at Lab Phase 1 Step 8: every lab page and the NCD registry at 390 px).
 */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });

describe("SIDEBAR_CLASS on the server", () => {
  it("lives in a plain module, and every shell imports it from there", () => {
    expect(readFileSync("components/medsync/sidebar-class.ts", "utf8")).not.toMatch(/^["']use client["']/m);
    expect(readFileSync("components/medsync/sidebar-nav.tsx", "utf8")).not.toMatch(/SIDEBAR_CLASS/);
    const users = ["app", "components"]
      .flatMap(files)
      .filter((p) => !p.endsWith("sidebar-class.ts"))
      .filter((p) => /\bSIDEBAR_CLASS\b/.test(readFileSync(p, "utf8")));
    expect(users.length).toBeGreaterThan(0);
    for (const p of users)
      expect(readFileSync(p, "utf8"), p).toMatch(
        /import \{ SIDEBAR_CLASS \} from "@\/components\/medsync\/sidebar-class"/,
      );
  });
});
