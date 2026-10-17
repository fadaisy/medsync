import type { ReadingInput, SugarContext } from "@/lib/readings";

import { parseReading, SUGAR_CONTEXT_WORDS } from "@/lib/readings";

/** Route params → a reading. Unknown kinds fall back to an empty BP, which checks as "empty". */
export function readingFromParams(p: {
  kind?: string;
  value?: string;
  context?: string;
}): ReadingInput {
  const v = p.value ?? "";
  if (p.kind === "sugar") {
    const context = (
      p.context && p.context in SUGAR_CONTEXT_WORDS ? p.context : "random"
    ) as SugarContext;
    return { kind: "sugar", value: parseReading(v), context };
  }
  if (p.kind === "pulse") return { kind: "pulse", value: parseReading(v) };
  if (p.kind === "weight") return { kind: "weight", value: parseReading(v) };
  const [top, bottom] = v.split("/");
  return { kind: "bp", top: parseReading(top ?? ""), bottom: parseReading(bottom ?? "") };
}
