import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 0, Law 8: opening a result screen reveals the patient's identity and writes a
 * clinical_phi_access_log row, so no lab list may prefetch one. Found at STOP 5: with default
 * prefetching, scrolling a 500-row worklist fetched (and logged) result screens nobody opened.
 */
const FILES = [
  "app/lab/_components/worklist-screen.tsx",
  "app/lab/released/page.tsx",
  "app/lab/rejected/page.tsx",
];

describe("lab lists never prefetch a result screen", () => {
  it.each(FILES)("%s: every /lab/results link has prefetch={false}", (f) => {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    const opens = src.split("href={`/lab/results/").length - 1;
    const guarded =
      src.match(/href=\{`\/lab\/results\/[^`]+`\}\s*prefetch=\{false\}/g)?.length ?? 0;
    expect(opens, f).toBeGreaterThan(0);
    expect(guarded, f).toBe(opens);
  });
});
