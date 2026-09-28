import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR 0162 on the clinical desk and chart (components/clerking, components/emr): place is the
 * Clinical hue (iris), never plum (Operations); headings take their weight from the type token.
 */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const sources = ["components/clerking", "components/emr"].flatMap(files);

describe("the clinical desk follows MedSync Chroma", () => {
  it("marks place with iris, never plum", () => {
    const hits = sources.filter((f) =>
      /\b(?:bg|text|border|ring)-plum-/.test(readFileSync(f, "utf8")),
    );
    expect(hits).toEqual([]);
  });

  it("never overrides a heading's weight", () => {
    const hits = sources.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<h[1-6]\b[^>]*?className="([^"]*)"/g)]
        .filter((m) => /\bfont-(?:medium|bold)\b/.test(m[1]!))
        .map((m) => `${f}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });
});
