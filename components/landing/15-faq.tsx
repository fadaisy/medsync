"use client";

import { SectionStub } from "./_section-stub";

/**
 * §15 — FAQ. Accessible accordion (no Attio analogue on the page).
 */
export function Faq() {
  return (
    <SectionStub
      n={15}
      name="FAQ"
      intent="Accordion with 7 honest questions: Is it live? · When can I use it? · How do I join? · Is my data safe? · Cost? · Which hospitals first? · Works without good internet?"
      runtime="client"
      buildAt="GATE E"
      todo={[
        '7 questions per spec; honest answers (e.g. "Not live yet — early access")',
        "Keyboard-accessible accordion (aria-expanded, focus management)",
        "shadcn-base disclosure pattern or hand-rolled details/summary",
      ]}
    />
  );
}
