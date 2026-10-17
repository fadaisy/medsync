import {
  buildSubmission,
  checkDob,
  formatUgPhone,
  initialDraft,
  isEmail,
  passwordOk,
  passwordStrength,
  phoneProblem,
  signupKey,
  stepOfField,
  stepValid,
  typeDob,
} from "@/features/auth/rules";

/** 17 Oct 2026, the day the boards were drawn. */
const TODAY = new Date(Date.UTC(2026, 9, 17, 12));

describe("date of birth (§8.1, law L10)", () => {
  it("refuses 31/02 as a date that does not exist", () => {
    const r = checkDob("31", "02", "1970", TODAY);
    expect(r).toMatchObject({ ok: false, reason: "not_real" });
  });

  it("refuses a future date", () => {
    expect(checkDob("01", "01", "2027", TODAY)).toMatchObject({ ok: false, reason: "future" });
    expect(checkDob("18", "10", "2026", TODAY)).toMatchObject({ ok: false, reason: "future" });
  });

  it("refuses age 17 (18th birthday tomorrow)", () => {
    expect(checkDob("18", "10", "2008", TODAY)).toMatchObject({ ok: false, reason: "under_18" });
  });

  it("accepts age 18 exactly (birthday today)", () => {
    expect(checkDob("17", "10", "2008", TODAY)).toEqual({ ok: true, iso: "2008-10-17" });
  });

  it("accepts age 120 and refuses 121", () => {
    expect(checkDob("17", "10", "1906", TODAY)).toMatchObject({ ok: true });
    expect(checkDob("16", "10", "1905", TODAY)).toMatchObject({ ok: false, reason: "over_120" });
  });

  it("waits for all three boxes before judging", () => {
    expect(checkDob("12", "03", "197", TODAY)).toMatchObject({
      ok: false,
      reason: "incomplete",
      message: "",
    });
  });

  it("does not keep a refused date of birth in state", () => {
    let d = initialDraft();
    d = typeDob(d, "dobDay", "18", TODAY).draft;
    d = typeDob(d, "dobMonth", "10", TODAY).draft;
    const out = typeDob(d, "dobYear", "2008", TODAY);
    expect(out.refused).toBe(true);
    expect(out.draft).toMatchObject({ dobDay: "", dobMonth: "", dobYear: "", refusedMinor: true });
    expect(JSON.stringify(out.draft)).not.toContain("2008");
  });

  it("keeps an adult's date and clears the refusal once typing starts again", () => {
    let d = { ...initialDraft(), refusedMinor: true };
    d = typeDob(d, "dobDay", "12", TODAY).draft;
    expect(d.refusedMinor).toBe(false);
    d = typeDob(d, "dobMonth", "03", TODAY).draft;
    const out = typeDob(d, "dobYear", "1972", TODAY);
    expect(out.refused).toBe(false);
    expect(out.draft).toMatchObject({ dobDay: "12", dobMonth: "03", dobYear: "1972" });
  });
});

describe("mobile number", () => {
  it("strips the leading 0 and groups 3·3·3", () => {
    expect(formatUgPhone("0772123456")).toBe("772 123 456");
    expect(formatUgPhone("+256 772 123 456")).toBe("772 123 456");
  });

  it("refuses a number starting 6", () => {
    expect(phoneProblem(formatUgPhone("672123456"))).toMatch(/start with 7/);
  });

  it("says nothing until nine digits are in, and accepts a 7 number", () => {
    expect(phoneProblem("772 12")).toBeNull();
    expect(phoneProblem("772 123 456")).toBeNull();
  });
});

describe("email and password", () => {
  it("checks the email shape", () => {
    expect(isEmail("name@example.com")).toBe(true);
    expect(isEmail(" name@example.com ")).toBe(true);
    expect(isEmail("name@example")).toBe(false);
    expect(isEmail("name example.com")).toBe(false);
    expect(isEmail("@example.com")).toBe(false);
  });

  it("needs 12 or more characters", () => {
    expect(passwordOk("a".repeat(11))).toBe(false);
    expect(passwordOk("a".repeat(12))).toBe(true);
    expect(passwordOk("é".repeat(37))).toBe(false); // 74 bytes, past bcrypt's 72
  });

  it("counts down and scores the strength in words", () => {
    expect(passwordStrength("")).toMatchObject({ score: 0 });
    expect(passwordStrength("abcdefghij")).toEqual({ score: 2, hint: "2 more characters to go" });
    expect(passwordStrength("my mango tree")).toMatchObject({ score: 3 });
    expect(passwordStrength("my mango tree 2026")).toEqual({ score: 4, hint: "Strong password" });
  });
});

describe("consent (law L9)", () => {
  it("leaves the SMS box unticked by default", () => {
    expect(initialDraft().sms).toBe(false);
    expect(initialDraft().consent).toBe(false);
    expect(initialDraft().pinConsent).toBe(false);
  });

  it("carries the version and hash of the notice shown, and never the map pin", () => {
    const notice = { version: "v1.0", sha: "a".repeat(64) };
    const sms = { version: "sms-v1.0", sha: "b".repeat(64) };
    const draft = {
      ...initialDraft(),
      firstName: " Sarah ",
      surname: "Nakato",
      sex: "female" as const,
      dobDay: "12",
      dobMonth: "03",
      dobYear: "1972",
      phone: "772 123 418",
      place: { code: "UG102007", label: "Kawempe Division, Kampala" },
      email: "Sarah@Example.com",
      password: "my mango tree 2026",
      consent: true,
      pin: { lat: 0.35, lng: 32.58, address: "Bombo Road" },
      pinConsent: true,
    };
    const input = buildSubmission(draft, notice, sms);
    expect(input).toMatchObject({
      firstName: "Sarah",
      phone: "+256772123418",
      place: "UG102007",
      email: "sarah@example.com",
      consent: true,
      consentVersion: "v1.0",
      consentSha: notice.sha,
      smsConsent: false,
      smsVersion: "sms-v1.0",
      smsSha: sms.sha,
    });
    expect(JSON.stringify(input)).not.toMatch(/pin/i);
  });

  it("step 4 needs the required consent box", () => {
    expect(stepValid(4, initialDraft(), TODAY)).toBe(false);
    expect(stepValid(4, { ...initialDraft(), consent: true }, TODAY)).toBe(true);
  });
});

describe("steps and the key", () => {
  it("step 1 opens only when every field is valid", () => {
    const d = {
      ...initialDraft(),
      firstName: "A",
      surname: "B",
      sex: "male" as const,
      dobDay: "1",
      dobMonth: "1",
      dobYear: "1980",
      phone: "772 123 456",
    };
    expect(stepValid(1, d, TODAY)).toBe(true);
    expect(stepValid(1, { ...d, phone: "672 123 456" }, TODAY)).toBe(false);
    expect(stepValid(1, { ...d, sex: null }, TODAY)).toBe(false);
  });

  it("sends a server field error back to its step", () => {
    expect(stepOfField("dobDay")).toBe(1);
    expect(stepOfField("place")).toBe(2);
    expect(stepOfField("password")).toBe(3);
  });

  it("makes a key the action accepts", () => {
    expect(signupKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
