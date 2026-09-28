import type { MarRowIn, PrescriptionRowIn } from "@/lib/emr/charts/build";
import { describe, expect, it } from "vitest";

import { buildMarBody, buildMarRow } from "@/lib/emr/charts/build";

/** Kampala is UTC+3. */
const k = (hhmm: string, day = 28) => new Date(`2026-09-${day}T${hhmm}:00+03:00`);
const WINDOW = { windowStart: k("00:00"), dayEnd: k("00:00", 29) };

const rx = (o: Partial<PrescriptionRowIn> = {}): PrescriptionRowIn => ({
  id: "rx-1",
  drugName: "Drug A",
  dose: "(fixture)",
  route: "oral",
  frequency: "6h",
  prn: false,
  start: "now",
  state: "active",
  kind: "drug",
  fluidPurpose: null,
  volumeMl: null,
  overMinutes: null,
  givingSetDropsPerMl: null,
  createdAt: k("00:00"),
  ...o,
});
let n = 0;
const given = (at: Date, o: Partial<MarRowIn> = {}): MarRowIn => ({
  id: `m-${++n}`,
  prescriptionId: "rx-1",
  state: "administered",
  withheldReason: null,
  scheduledFor: null,
  administeredAt: at,
  isHighAlert: false,
  cosignedByUserId: null,
  ...o,
});
const cells = (r: ReturnType<typeof buildMarRow>) =>
  r.cells.map((c) => [new Date(c.at).toISOString(), c.state, c.word, c.detail]);

describe("MAR cells: words in every cell", () => {
  it("a cell per due time: Given hh:mm, Delayed when past and unrecorded, Due when to come", () => {
    const r = buildMarRow(rx(), [given(k("00:05"))], { ...WINDOW, now: k("07:00") });
    expect(cells(r)).toEqual([
      [k("00:05").toISOString(), "given", "Given 00:05", null],
      [k("06:05").toISOString(), "delayed", "Delayed", null],
      [k("12:05").toISOString(), "due", "Due", null],
      [k("18:05").toISOString(), "due", "Due", null],
    ]);
    expect(r.detail).toBe("oral · 6-hourly");
    expect(r.note).toBeNull();
  });

  it("an omitted dose says why", () => {
    const r = buildMarRow(
      rx(),
      [
        given(k("00:00")),
        given(k("06:10"), {
          state: "refused",
          withheldReason: "declined when woken",
          scheduledFor: k("06:00"),
        }),
        given(k("12:00"), { state: "withheld", withheldReason: "nil by mouth for theatre" }),
      ],
      { ...WINDOW, now: k("13:00") },
    );
    expect(r.cells.map((c) => c.word)).toEqual([
      "Given 00:00",
      "Omitted (declined when woken)",
      "Omitted (nil by mouth for theatre)",
      "Due",
    ]);
  });

  it("a high-alert dose not yet co-signed is Awaiting co-sign; once co-signed, Given", () => {
    const waiting = buildMarRow(
      rx({ frequency: "stat" }),
      [given(k("01:00"), { isHighAlert: true })],
      {
        ...WINDOW,
        now: k("02:00"),
      },
    );
    expect(cells(waiting)).toEqual([
      [k("01:00").toISOString(), "awaiting_cosign", "Awaiting co-sign", "Given 01:00"],
    ]);
    const signed = buildMarRow(
      rx({ frequency: "stat" }),
      [given(k("01:00"), { isHighAlert: true, cosignedByUserId: "u-2" })],
      { ...WINDOW, now: k("02:00") },
    );
    expect(signed.cells.map((c) => c.state)).toEqual(["given"]);
  });

  it("a dose that matches no due time gets its own cell", () => {
    const r = buildMarRow(rx({ frequency: "12h" }), [given(k("00:00")), given(k("03:00"))], {
      ...WINDOW,
      now: k("04:00"),
    });
    expect(r.cells.map((c) => [c.word, new Date(c.at).toISOString()])).toEqual([
      ["Given 00:00", k("00:00").toISOString()],
      ["Given 03:00", k("03:00").toISOString()],
      ["Due", k("12:00").toISOString()],
    ]);
  });

  it("as needed, the next round and a stopped prescription draw no due times, and say so", () => {
    const prn = buildMarRow(rx({ prn: true }), [], { ...WINDOW, now: k("04:00") });
    expect([prn.cells, prn.note]).toEqual([[], "As needed"]);
    expect(prn.detail).toBe("oral · 6-hourly as needed");
    const next = buildMarRow(rx({ start: "next_round" }), [], { ...WINDOW, now: k("04:00") });
    expect([next.cells, next.note]).toEqual([[], "From the next drug round"]);
    const stopped = buildMarRow(rx({ state: "cancelled" }), [given(k("00:10"))], {
      ...WINDOW,
      now: k("09:00"),
    });
    expect(stopped.cells.map((c) => c.word)).toEqual(["Given 00:10"]);
    expect(stopped.note).toBe("Stopped");
  });

  it("a fluid shows Running while its time is not up, then Given with its start", () => {
    const fluid = rx({
      kind: "fluid",
      drugName: "Ringer's lactate",
      route: "iv",
      frequency: null,
      volumeMl: "1000",
      overMinutes: 480,
    });
    const running = buildMarRow(fluid, [given(k("00:10"))], { ...WINDOW, now: k("07:00") });
    expect(cells(running)).toEqual([
      [k("00:10").toISOString(), "running", "Running", "From 00:10"],
    ]);
    expect(running).toMatchObject({
      label: "Ringer's lactate 1000 mL over 8 h",
      detail: "IV · 125 mL/h",
      fluid: true,
    });
    const done = buildMarRow(fluid, [given(k("00:10"))], { ...WINDOW, now: k("09:00") });
    expect(cells(done)).toEqual([[k("00:10").toISOString(), "given", "Given 00:10", "Over 8 h"]]);
    const notStarted = buildMarRow(fluid, [], { ...WINDOW, now: k("01:00") });
    expect(notStarted.cells.map((c) => c.word)).toEqual(["Delayed"]);
  });

  it("the grid lists fluids first; the window reaches back to when the plan opened the chart", () => {
    const body = buildMarBody({
      chart: { openedAt: k("23:40", 27) },
      prescriptions: [
        rx({ id: "d", frequency: "daily", createdAt: k("23:40", 27) }),
        rx({ id: "f", kind: "fluid", volumeMl: "500", overMinutes: 60, frequency: null }),
      ],
      mar: [given(k("23:45", 27), { prescriptionId: "d" })],
      dayStart: k("00:00"),
      now: k("06:00"),
    });
    expect(body.rows.map((r) => r.prescriptionId)).toEqual(["f", "d"]);
    expect(body.rows[1]!.cells.map((c) => c.word)).toEqual(["Given 23:45", "Due"]);
  });
});
