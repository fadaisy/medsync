import { describe, expect, it } from "vitest";

import { promptFor, readReply } from "@/app/api/mobile/reading-photo/_lib/read";

describe("reading a photo of a home device (ADR 0352)", () => {
  it("asks for what is shown and nothing guessed", () => {
    expect(promptFor("bp")).toMatch(/Do not guess/);
    expect(promptFor("sugar")).toMatch(/mg\/dL/);
  });

  it("fills blood pressure and pulse from the screen", () => {
    expect(readReply("bp", 'Here: {"top": 128, "bottom": 84, "pulse": 72}')).toEqual({
      ok: true,
      top: "128",
      bottom: "84",
      pulse: "72",
    });
    expect(readReply("bp", '{"top": 128, "bottom": 84, "pulse": null}')).toEqual({
      ok: true,
      top: "128",
      bottom: "84",
    });
  });

  it("refuses what a screen cannot show rather than clamping it", () => {
    expect(readReply("bp", '{"top": 84, "bottom": 128}')).toEqual({ ok: false, reason: "unreadable" });
    expect(readReply("bp", '{"top": 999, "bottom": 80}').ok).toBe(false);
    expect(readReply("bp", '{"unreadable": true}').ok).toBe(false);
    expect(readReply("weight", "I can't see a scale.").ok).toBe(false);
  });

  it("turns mg/dL into mmol/L and pounds into kg", () => {
    expect(readReply("sugar", '{"value": 126, "unit": "mg/dL"}')).toEqual({ ok: true, value: "7.0" });
    expect(readReply("sugar", '{"value": 6.4, "unit": "mmol/L"}')).toEqual({ ok: true, value: "6.4" });
    expect(readReply("weight", '{"value": 154, "unit": "lb"}')).toEqual({ ok: true, value: "70.0" });
  });
});
