import { describe, expect, it } from "vitest";

import { LAB5 } from "@/content/lab-phase-5";
import { lint, plainness, PlainWordsPayload } from "@/lib/lab/plain-words";
import {
  batchKey,
  inBatch,
  nextSendTime,
  render,
  shouldSend,
  templateErrors,
} from "@/lib/notify/results-ready";

describe("PS-1, PS-4 the results-ready template", () => {
  it("the Appendix A wording passes: hospital only, no test, value, clinic or link, a STOP route", () => {
    expect(templateErrors({ text: LAB5.resultsReadySms, senderId: "MedSync" })).toEqual([]);
    expect(render(LAB5.resultsReadySms, "Test Hospital")).toMatch(
      /^Test Hospital: you have new results/,
    );
  });
  it("refuses a test name, a value, a clinic, a link, another placeholder or no STOP", () => {
    expect(
      templateErrors({
        text: "{Hospital}: your HIV result is ready. Reply STOP",
        senderId: "MedSync",
      }),
    ).toContain("reveals_condition_or_value");
    expect(
      templateErrors({
        text: "{Hospital}: your result 5.2 is ready. Reply STOP",
        senderId: "MedSync",
      }),
    ).toContain("reveals_condition_or_value");
    expect(
      templateErrors({
        text: "{Hospital}: see https://x.test/r. Reply STOP to stop",
        senderId: "MedSync",
      }),
    ).toContain("link_not_allowed");
    expect(
      templateErrors({
        text: "{Hospital}: {Test} ready. Reply STOP to stop these",
        senderId: "MedSync",
      }),
    ).toContain("placeholder_not_allowed");
    expect(
      templateErrors({ text: "{Hospital}: you have new results in MedSync.", senderId: "MedSync" }),
    ).toContain("stop_route_missing");
    expect(templateErrors({ text: LAB5.resultsReadySms, senderId: "ARTClinic" })).toContain(
      "sender_reveals_condition",
    );
  });
});

describe("PS-2 who gets one, PS-3 when and how often", () => {
  const ok = {
    becameVisible: true,
    groupAllowsSms: true,
    smsConsent: true,
    phoneVerified: true,
    optedOut: false,
  };
  it("only a newly visible result of an SMS group, to an opted-in verified number not opted out", () => {
    expect(shouldSend(ok)).toBe(true);
    for (const k of ["becameVisible", "groupAllowsSms", "smsConsent", "phoneVerified"] as const)
      expect(shouldSend({ ...ok, [k]: false })).toBe(false);
    expect(shouldSend({ ...ok, optedOut: true })).toBe(false);
  });
  it("06:00 to 19:00 Kampala; 21:00 waits for 06:00 the next day; 03:00 for 06:00 the same day", () => {
    const at = (iso: string) => new Date(iso);
    expect(nextSendTime(at("2026-10-17T07:00:00Z")).toISOString()).toBe("2026-10-17T07:00:00.000Z"); // 10:00 EAT
    expect(nextSendTime(at("2026-10-17T18:00:00Z")).toISOString()).toBe("2026-10-18T03:00:00.000Z"); // 21:00 → 06:00
    expect(nextSendTime(at("2026-10-17T00:00:00Z")).toISOString()).toBe("2026-10-17T03:00:00.000Z"); // 03:00 → 06:00
    expect(nextSendTime(at("2026-10-17T16:00:00Z")).toISOString()).toBe("2026-10-18T03:00:00.000Z"); // 19:00 exactly
    expect(nextSendTime(at("2026-10-17T20:59:00Z")).toISOString()).toBe("2026-10-18T03:00:00.000Z"); // 23:59 across midnight
  });
  it("one per patient per batching window", () => {
    const t0 = new Date("2026-10-17T07:00:00Z");
    expect(inBatch(null, t0)).toBe(false);
    expect(inBatch(t0, new Date(t0.getTime() + 30 * 60_000))).toBe(true);
    expect(inBatch(t0, new Date(t0.getTime() + 61 * 60_000))).toBe(false);
    expect(batchKey("p1", t0)).toBe(batchKey("p1", new Date(t0.getTime() + 59_000)));
  });
});

describe("PW plain words: shape, lint, plainness", () => {
  const words = {
    concept: "obs.creatinine",
    language: "en",
    whatThisTestIs: "This test shows how well your kidneys clean your blood.",
    shortLine: "A kidney test.",
    action: {
      within: "No action needed.",
      higher: "Your doctor will talk with you about this.",
      lower: "Your doctor will talk with you about this.",
      noRange: "Ask your doctor what this means.",
    },
    harmAnchor: null,
    calculated: [],
    readability: { method: "Fixture method", score: 1 },
    translation: null,
    bannedPhrases: ["nothing to worry about"],
  };
  it("English needs no translation record; another language needs translator, back translator and reviewer", () => {
    expect(PlainWordsPayload.safeParse(words).success).toBe(true);
    expect(PlainWordsPayload.safeParse({ ...words, language: "lg" }).success).toBe(false);
    expect(
      PlainWordsPayload.safeParse({
        ...words,
        language: "lg",
        translation: { translator: "A B", backTranslator: "C D", reviewer: "E F" },
      }).success,
    ).toBe(true);
  });
  it("PW-3 the lint catches dosing, treatment instructions and the signed phrases", () => {
    expect(lint(words, words.bannedPhrases)).toEqual([]);
    expect(
      lint({ ...words, shortLine: "This is nothing to worry about." }, words.bannedPhrases),
    ).toContain("nothing to worry about");
    expect(
      lint({ ...words, action: { ...words.action, higher: "Take 500 mg more." } }, []),
    ).toHaveLength(1);
    expect(
      lint({ ...words, action: { ...words.action, higher: "Stop taking your tablets." } }, []),
    ).toHaveLength(1);
  });
  it("PW-2 plainness reports sentences and long words", () => {
    expect(plainness("Short words. Two sentences.")).toMatchObject({ sentences: 2, longWords: 0 });
  });
});
