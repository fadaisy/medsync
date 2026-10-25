import { patternFor, SLOT_TIMES, SLOT_WORDS, slotOf } from "@patient-core/dose-slots";
import { feeFor, feeText, payLook } from "@patient-core/fees";
import { FALLBACK, KIND_WORDS, notifTarget } from "@patient-core/notifications";
import { CANCELLABLE, RESCHEDULABLE, STATUS_LABEL } from "@patient-core/visits";
import { describe, expect, it } from "vitest";

describe("@patient-core resolves from the web", () => {
  it("fees", () => {
    expect(feeText(30000)).toBe("UGX 30,000");
    expect(feeText(null)).toBe("No fee");
    expect(payLook(0, false)).toBe("free");
    expect(payLook(5000, false)).toBe("owed");
    expect(payLook(5000, true)).toBe("paid");
    expect(feeFor([], "d", null)).toEqual({ fee: null, feeLabel: null });
  });

  it("visits", () => {
    expect(STATUS_LABEL.no_show).toBe("Missed");
    expect(CANCELLABLE.has("arrived")).toBe(true);
    expect(RESCHEDULABLE.has("arrived")).toBe(false);
  });

  it("dose slots", () => {
    expect(SLOT_WORDS.morning).toBe("Morning");
    expect(SLOT_TIMES.night).toBe("22:00");
    expect(slotOf("10:59")).toBe("morning");
    expect(slotOf("11:00")).toBe("midday");
    expect(patternFor(["08:00", "20:00"])).toBe("twice_daily");
  });

  it("notifications", () => {
    expect(KIND_WORDS.booking_receipt?.title).toBe("Your visit is booked");
    expect(FALLBACK.type).toBe("care");
    expect(notifTarget({ kind: "x", related_kind: "appointment", related_id: "a1" })).toEqual({
      key: "visit",
      id: "a1",
    });
    expect(notifTarget({ kind: "position_called", related_kind: "", related_id: "" })).toEqual({
      key: "ticket",
    });
    expect(notifTarget({ kind: "x", related_kind: "other", related_id: "" })).toBeUndefined();
  });
});
