import type { ReportedItem } from "@/lib/patient/reported-history";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardLines, splitHistory } from "@patient-core/me-health";
import { householdProblem, MINOR_REFUSAL } from "@patient-core/me-profile";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MeHealthCard } from "@/components/tide/me-health-card";
import { ME_COPY } from "@/content/patient/me";
import { SMS_CONSENT_COPY } from "@/lib/notifications/consent-copy";
import { REPORTED_CATALOGUE } from "@/lib/patient/reported-history";

/** Me (Step 6): S18 private entries never on the card, S19 adults only, S20 SMS off explains and writes. */

const callEdge = vi.fn();
vi.mock("@/lib/supabase/edge", () => ({ callEdge: (...a: unknown[]) => callEdge(...a) }));
vi.mock("@/lib/patient/scope", () => ({ requirePatientScope: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/patient-web/me-data", () => ({ asPatientRequest: async () => null }));
vi.mock("@/app/api/mobile/profile/route", () => ({ POST: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const cond = (itemId: string, extra: Partial<ReportedItem> = {}): ReportedItem => ({
  id: itemId,
  kind: "condition",
  itemId,
  otherText: null,
  onsetYear: null,
  resolved: false,
  relation: null,
  reactions: [],
  severity: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("S18: private entries never show on the card", () => {
  const items = [
    cond("hypertension"),
    cond("hiv"),
    cond("tuberculosis"),
    cond("mental_illness"),
    cond("gestational_diabetes_before"),
  ];
  const lines = cardLines(splitHistory(items), []);

  it("the conditions line holds only the non-private one", () => {
    expect(lines.conditions).toBe("Hypertension");
    for (const word of ["HIV", "Tuberculosis", "Mental", "Gestational", "pregnancy"])
      expect(lines.conditions).not.toContain(word);
  });

  it("every catalogue entry with a sensitivity class is left out", () => {
    const privateOnes = REPORTED_CATALOGUE.conditions.filter((o) => "sensitivity" in o);
    expect(privateOnes.map((o) => o.id)).toEqual(
      expect.arrayContaining([
        "hiv",
        "tuberculosis",
        "mental_illness",
        "gestational_diabetes_before",
      ]),
    );
    const only = cardLines(splitHistory(privateOnes.map((o) => cond(o.id))), ["Old note"]);
    // Listed but private: "None listed", and the legacy line does not stand in either.
    expect(only.conditions).toBe("None listed");
  });

  it("both toggle states of the rendered card: hidden, or the filtered line, never a private entry", () => {
    const card = (conditions: string | null) =>
      renderToStaticMarkup(
        h(MeHealthCard, {
          data: {
            holder: "[First name]",
            number: "MS 2026 00042",
            facility: null,
            age: null,
            conditions,
            allergies: lines.allergies,
            nextOfKin: null,
            ifFound: "If found, please return it to any hospital",
          },
        }),
      );
    const off = card(null);
    const on = card(lines.conditions);
    expect(off).toContain("Hidden by the card holder");
    expect(on).toContain("Hypertension");
    for (const html of [off, on])
      for (const word of ["HIV", "Tuberculosis", "Mental illness", "Gestational"])
        expect(html).not.toContain(word);
  });

  it("a resolved condition leaves the card too", () => {
    expect(cardLines(splitHistory([cond("diabetes", { resolved: true })]), []).conditions).toBe(
      "None listed",
    );
  });
});

describe("S19: adults only", () => {
  const now = new Date("2026-10-25T09:00:00Z");
  const ok = {
    label: "[First name]",
    phone: "0772000000",
    age: "40",
    dob: "",
    relationship: "parent" as const,
    adult: true,
  };

  it("a complete adult passes", () => expect(householdProblem(ok, now)).toBeNull());
  it("without the adult switch: the function's sentence", () =>
    expect(householdProblem({ ...ok, adult: false }, now)).toBe(MINOR_REFUSAL));
  it("an age under 18: the same sentence, switch or not", () =>
    expect(householdProblem({ ...ok, age: "17" }, now)).toBe(MINOR_REFUSAL));
  it("a date of birth under 18: the same sentence", () =>
    expect(householdProblem({ ...ok, age: "", dob: "2010-01-01" }, now)).toBe(MINOR_REFUSAL));
  it("the sentence is the reference's", () =>
    expect(MINOR_REFUSAL).toBe("Booking for a child is not available yet."));
  it("refused before anything is sent", async () => {
    const { addHouseholdAction } = await import("@/lib/patient-web/me-actions");
    callEdge.mockReset();
    expect(await addHouseholdAction({ ...ok, age: "12" })).toEqual({
      ok: false,
      error: MINOR_REFUSAL,
    });
    expect(callEdge).not.toHaveBeenCalled();
  });
});

describe("S20: SMS off explains itself and writes through pt-set-sms-consent", () => {
  beforeEach(() => callEdge.mockReset());

  it("off shows the explanation and the receipt exception; on shows what is sent", () => {
    expect(ME_COPY.smsSub(false)).toBe(
      `${SMS_CONSENT_COPY.declined} ${SMS_CONSENT_COPY.receiptException}`,
    );
    expect(ME_COPY.smsSub(true)).toBe(SMS_CONSENT_COPY.what);
    expect(ME_COPY.smsTitle(false)).toBe("Send me SMS about my bookings · Off");
  });

  it("turning it off calls the Edge Function with on: false", async () => {
    callEdge.mockResolvedValue({ ok: true, data: { on: false } });
    const { setSmsConsentAction } = await import("@/lib/patient-web/me-actions");
    expect(await setSmsConsentAction(false)).toEqual({ ok: true, on: false });
    expect(callEdge).toHaveBeenCalledWith("pt-set-sms-consent", { on: false }, "patient-web.me");
  });

  it("the server's sentence comes back word for word", async () => {
    callEdge.mockResolvedValue({ ok: false, error: "SMS settings are not available yet." });
    const { setSmsConsentAction } = await import("@/lib/patient-web/me-actions");
    expect(await setSmsConsentAction(false)).toEqual({
      ok: false,
      error: "SMS settings are not available yet.",
    });
  });
});
