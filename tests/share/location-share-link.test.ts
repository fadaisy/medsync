import { describe, expect, it } from "vitest";

import {
  agoWords,
  googleMapsUrl,
  isShareToken,
  satelliteEmbedUrl,
  ugandaClock,
} from "@/app/share/location/[token]/_lib/share";

describe("the family location link (ADR 0402)", () => {
  it("asks the database only about a token of 64 lowercase hex characters", () => {
    expect(isShareToken("0a".repeat(32))).toBe(true);
    expect(isShareToken("0a".repeat(31))).toBe(false);
    expect(isShareToken("0A".repeat(32))).toBe(false);
    expect(isShareToken(`${"0a".repeat(32)}0`)).toBe(false);
    expect(isShareToken(`${"0a".repeat(31)}'-`)).toBe(false);
    expect(isShareToken("")).toBe(false);
  });

  it("says how old the position is in plain words", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(agoWords(new Date("2026-10-18T11:59:30Z"), now)).toBe("just now");
    expect(agoWords(new Date("2026-10-18T11:48:00Z"), now)).toBe("12 min ago");
    expect(agoWords(new Date("2026-10-18T09:30:00Z"), now)).toBe("2 h ago");
  });

  it("shows the end time in Uganda time", () => {
    expect(ugandaClock(new Date("2026-10-18T11:30:00Z"))).toBe("14:30");
  });

  it("builds keyless map links around the pin", () => {
    expect(satelliteEmbedUrl(0.3476, 32.5825)).toBe(
      "https://maps.google.com/maps?q=0.3476%2C32.5825&t=h&z=18&output=embed",
    );
    expect(googleMapsUrl(0.3476, 32.5825)).toBe(
      "https://www.google.com/maps/search/?api=1&query=0.3476%2C32.5825",
    );
  });
});
