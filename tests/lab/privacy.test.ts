import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 0, Law 8: opening a result screen reveals the patient's identity and writes a
 * clinical_phi_access_log row, so no lab list may prefetch one. Found at STOP 5: with default
 * prefetching, scrolling a 500-row worklist fetched (and logged) result screens nobody opened.
 */
const FILES = ["app/lab/bench/_views/released.tsx", "app/lab/bench/_views/rejected.tsx"];

describe("lab lists never prefetch a result screen", () => {
  it.each(FILES)("%s: every /lab/results link has prefetch={false}", (f) => {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    // Lab Workspace v2: the views link to the bench work pane (or, flag off, the old result page).
    const opens = src.match(/href=\{`[^`]*\/lab\/(?:results|bench)[^`]*`\}/g)?.length ?? 0;
    const guarded =
      src.match(/href=\{`[^`]*\/lab\/(?:results|bench)[^`]*`\}\s*prefetch=\{false\}/g)?.length ?? 0;
    expect(opens, f).toBeGreaterThan(0);
    expect(guarded, f).toBe(opens);
  });
});

describe("Lab Workspace v2: the queue, the inbox and the specimen search never prefetch a result screen", () => {
  it.each(["app/lab/bench/_components/queue.tsx", "app/lab/_components/v2/inbox.tsx"])(
    "%s",
    (f) => {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      const links = src.match(/<Link\b[^>]*?href=/g)?.length ?? 0;
      expect(links, f).toBeGreaterThan(0);
      expect(src.match(/prefetch=\{false\}/g)?.length ?? 0, f).toBe(links);
    },
  );
});
