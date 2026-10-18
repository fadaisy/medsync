import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";

import { bookingSymptoms, EMPTY_NOTE, noteTier } from "@/features/visits/symptom-note-logic";

describe("Ask for a day: the symptom note", () => {
  it("says nothing until something is chosen", () => {
    expect(noteTier(EMPTY_NOTE, "adult", CATALOG)).toBeNull();
  });

  it("takes the catalogue's tier, raised by an answer", () => {
    const wheeze = { items: ["SYM.CHEST.WHEEZE"], qualifiers: {} };
    expect(noteTier(wheeze, "adult", CATALOG)?.tier).toBe("U");
    const cannotSpeak = { ...wheeze, qualifiers: { "SYM.CHEST.WHEEZE": { can_speak: "no" } } };
    expect(noteTier(cannotSpeak, "adult", CATALOG)?.tier).toBe("E");
    expect(
      noteTier({ items: ["SYM.CHEST.COUGH_OVER_2_WEEKS"], qualifiers: {} }, "adult", CATALOG),
    ).toMatchObject({ tier: "R", because: expect.any(String) });
  });

  it("sends the words and answers, never a tier", () => {
    const out = bookingSymptoms(
      { items: ["SYM.CHEST.WHEEZE"], qualifiers: { "SYM.CHEST.WHEEZE": { can_speak: "no" } } },
      CATALOG,
    );
    expect(out).toEqual([
      {
        code: "SYM.CHEST.WHEEZE",
        label: "Wheezing or tight chest not settling with inhaler",
        duration: null,
        qualifiers: [{ key: "can_speak", option: "no", label: "No" }],
      },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/tier/i);
  });
});
