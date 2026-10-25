import type { BookingAttachment } from "@/components/medsync/booking-attachments";
import { describe, expect, it } from "vitest";

import { attachmentSummary } from "@/components/medsync/booking-attachments";

const a = (kind: BookingAttachment["kind"], id: string): BookingAttachment => ({
  id,
  kind,
  url: `https://example.test/${id}`,
  mime: "x/y",
  durationMs: null,
});

describe("attachmentSummary (ADR 0406)", () => {
  it("counts what came, in words, photos then videos then voice notes", () => {
    expect(attachmentSummary([a("voice", "1"), a("photo", "2"), a("photo", "3")])).toBe(
      "2 photos · 1 voice note",
    );
  });

  it("uses the singular for one of each", () => {
    expect(attachmentSummary([a("photo", "1"), a("video", "2"), a("voice", "3")])).toBe(
      "1 photo · 1 video · 1 voice note",
    );
  });

  it("says nothing when nothing was sent", () => {
    expect(attachmentSummary([])).toBe("");
  });
});
