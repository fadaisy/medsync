import type { ExamPlace } from "@/components/clerking/exam/exam-step";
import type { ExamDraft } from "@/lib/clerking/exam/payload";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClerkingDesk } from "@/components/clerking/clerking-desk";
import { ecat } from "./exam-fixtures";
import { cat, v2Payload } from "./fixtures";

/** The v2 desk on step 07 with an examination draft, as static markup (import after mocking
 *  next/navigation). */
export function examMarkup(
  exam: ExamDraft,
  place: ExamPlace,
  over: { sex?: "male" | "female" } = {},
) {
  const p = v2Payload();
  if (over.sex) p.clerking!.sex = over.sex;
  const content = { ...p.draft!.content, exam: exam as never };
  return renderToStaticMarkup(
    h(ClerkingDesk, {
      p,
      cat,
      ecat,
      content,
      current: "exam",
      save: { tone: "neutral", text: "Saved 08:19" },
      on: { onContent() {} },
      loaders: { findings: async () => [], terms: async () => [] },
      examPlace: place,
    }),
  );
}
