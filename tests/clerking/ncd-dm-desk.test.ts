/**
 * The diabetes pack inside the ten-step desk, end to end through deriveDesk (ADR 0216): a clerking
 * record, nothing typed into any diabetes form, and the pack's result in the flags, the profile
 * and the Plan's inputs. Synthetic patient (Patient Three-3, a man of 76).
 */
import type { NoteContent } from "@/lib/emr/note-rules";
import { describe, expect, it } from "vitest";

import { examOf, withExam } from "@/components/clerking/exam/model";
import { deriveDesk, historyOf, withHistory } from "@/components/clerking/model";
import { diabetesPack } from "@/lib/ncd/pack";
import { packFieldCodes } from "@/lib/ncd/pack/capture";
import { ecat } from "./exam-fixtures";
import { cat, v2Payload } from "./fixtures";

const dm = { pack: diabetesPack(), fields: packFieldCodes() };
const p = v2Payload();
// The fixture's draft carries a v1 examination (a previous-format note, which the ten-step desk
// leaves alone); a ten-step draft has none.
const { s11: _v1Exam, ...sections } = p.draft!.content.sections;
const base: NoteContent = { ...p.draft!.content, sections };

function record(glucose: string | null, known = true): NoteContent {
  const h = historyOf(base);
  const withDm = withHistory(
    base,
    {
      ...h,
      past: {
        ...h.past,
        conditions: {
          ...h.past.conditions,
          ...(known ? { diabetes: { answer: "yes", details: { type: "type_2" } } } : {}),
        },
      },
    },
    cat.version,
  );
  if (glucose === null) return withDm;
  const exam = examOf(withDm, ecat.version);
  return withExam(
    withDm,
    { ...exam, vitalsDraft: { ...exam.vitalsDraft, glucose, glucoseContext: "random" } },
    ecat.version,
  );
}

describe("the diabetes pack reads the ten-step clerking", () => {
  it("is silent when off: no diabetes result, no pack flags", () => {
    const d = deriveDesk(cat, p, record("2.4"), ecat);
    expect(d.diabetes).toBeNull();
    expect(d.flags.some((f) => f.where === "Diabetes pack")).toBe(false);
  });

  it("known diabetes from past history shows the profile as known", () => {
    const d = deriveDesk(cat, p, record(null), ecat, undefined, null, dm);
    expect(d.diabetes?.established).toBe(true);
    expect(d.diabetes?.show).toBe(true);
  });

  it("a meter glucose of 2.4 in known diabetes raises the one urgent diabetes flag", () => {
    const d = deriveDesk(cat, p, record("2.4"), ecat, undefined, null, dm);
    const act = d.badges.filter((b) => b.label === "Diabetes: act now");
    expect(act).toHaveLength(1);
    expect(act[0]!.level).toBe("urgent");
    expect(act[0]!.reasons[0]!.reason).toMatch(/hypoglycaemia/i);
  });

  it("profiles from the history alone: polyuria with weight loss, no diabetes recorded", () => {
    // Patient Three-3's complaint is passing a lot of urine, with weight loss and blurred vision.
    const d = deriveDesk(cat, p, record(null, false), ecat, undefined, null, dm);
    expect(d.diabetes?.established).toBe(false);
    expect(d.diabetes?.result.fired["DM-SUS-SYMP-01"]).toBe("rule");
    expect(d.diabetes?.show).toBe(true);
    expect(d.badges.some((b) => b.label === "Diabetes: today")).toBe(true);
  });
});
