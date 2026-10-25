import {
  buildSubmission,
  checkDob,
  e164,
  formatUgPhone,
  initialDraft,
  passwordOk,
  passwordStrength,
  phoneProblem,
  stepOfField,
  typeDob,
} from "@patient-core/getting-in-signup";
import { describe, expect, it } from "vitest";

import { patientSchema } from "@/lib/onboarding/schemas";
import { IDLE_MS, idleExpired, parseDeviceChoice } from "@/lib/patient-web/getting-in-device";

const TODAY = new Date(Date.UTC(2026, 9, 25, 12));

describe("S25: every sign-up validation with its words", () => {
  it("31/02 does not exist", () => {
    expect(checkDob("31", "02", "1970", TODAY)).toMatchObject({
      ok: false,
      message: "That date does not exist. Check the day and month.",
    });
  });
  it("a future date", () => {
    expect(checkDob("26", "10", "2026", TODAY)).toMatchObject({
      ok: false,
      message: "The date cannot be in the future.",
    });
  });
  it("age 17 is wiped from the draft and never kept, only the fact", () => {
    const d = typeDob(
      { ...initialDraft(), dobDay: "26", dobMonth: "10" },
      "dobYear",
      "2008",
      TODAY,
    );
    expect(d.refused).toBe(true);
    expect(d.draft).toMatchObject({ dobDay: "", dobMonth: "", dobYear: "", refusedMinor: true });
    expect(JSON.stringify(d.draft)).not.toContain("2008");
  });
  it("121 asks to check the year", () => {
    expect(checkDob("01", "01", "1905", TODAY)).toMatchObject({
      message: "Please check the year.",
    });
  });
  it("a number starting 6 is refused; the leading 0 and +256 are stripped", () => {
    expect(phoneProblem(formatUgPhone("612345678"))).toBe(
      "Ugandan mobile numbers start with 7, like 772 000 000",
    );
    expect(formatUgPhone("0772123456")).toBe("772 123 456");
    expect(formatUgPhone("+256 772 123 456")).toBe("772 123 456");
    expect(e164("772 123 456")).toBe("+256772123456");
  });
  it("a 12-character password", () => {
    expect(passwordOk("abcdefghijk")).toBe(false);
    expect(passwordOk("abcdefghijkl")).toBe(true);
    expect(passwordStrength("abcdefghijk").hint).toBe("1 more characters to go");
  });
  it("a server field error goes back to its step", () => {
    expect(stepOfField("place")).toBe(2);
    expect(stepOfField("password")).toBe(3);
    expect(stepOfField("consentSha")).toBe(4);
    expect(stepOfField("dobDay")).toBe(1);
  });
});

describe("S26: consent is written as the phone writes it", () => {
  const sha = "a".repeat(64);
  const draft = {
    ...initialDraft(),
    firstName: " Sarah ",
    surname: "Nakato",
    sex: "female" as const,
    dobDay: "01",
    dobMonth: "02",
    dobYear: "1990",
    phone: "772 123 456",
    place: { code: "X", label: "X" },
    email: " Sarah@Example.com ",
    password: "a long sentence 1",
    consent: true,
  };

  it("the SMS box starts unticked", () => {
    expect(initialDraft().sms).toBe(false);
  });

  it("binds the notice and SMS shown, and the server schema takes it", () => {
    const input = buildSubmission(draft, { version: "v3", sha }, { version: "s1", sha });
    expect(input).toMatchObject({
      consentVersion: "v3",
      consentSha: sha,
      smsConsent: false,
      smsVersion: "s1",
      smsSha: sha,
      phone: "+256772123456",
      email: "sarah@example.com",
      firstName: "Sarah",
    });
    const parsed = patientSchema.safeParse(input);
    const issues = parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] !== "place");
    expect(issues).toEqual([]);
  });

  it("no SMS text on screen means no SMS consent", () => {
    const input = buildSubmission({ ...draft, sms: true }, { version: "v3", sha }, null);
    expect(input.smsConsent).toBe(false);
  });
});

describe("D-PW-05/06: the device choice and idle sign-out", () => {
  it("reads only the two words; anything else is unasked", () => {
    expect(parseDeviceChoice("own")).toBe("own");
    expect(parseDeviceChoice("shared")).toBe("shared");
    expect(parseDeviceChoice("yes")).toBeNull();
    expect(parseDeviceChoice(undefined)).toBeNull();
  });
  it("15 minutes on a shared or unanswered device, 7 days on your own", () => {
    expect(IDLE_MS.shared).toBe(15 * 60_000);
    expect(idleExpired(0, 15 * 60_000 - 1, null)).toBe(false);
    expect(idleExpired(0, 15 * 60_000, null)).toBe(true);
    expect(idleExpired(0, 15 * 60_000, "own")).toBe(false);
    expect(idleExpired(0, 7 * 24 * 3_600_000, "own")).toBe(true);
  });
});
