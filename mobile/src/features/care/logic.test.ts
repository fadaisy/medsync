import { dayHeadline, saveButton, timelineFill } from "@/features/care/logic";
import { checkReading } from "@/lib/readings";

describe("Medicines headline and timeline", () => {
  it.each([
    [0, "Three to go today", 0],
    [1, "One down, two to go", 0.25],
    [2, "Two down, one to go", 0.5],
    [3, "All done for today", 1],
  ])("%i of 3 taken", (taken, headline, fill) => {
    expect(dayHeadline(taken, 3)).toBe(headline);
    expect(timelineFill(taken, 3)).toBeCloseTo(fill);
  });

  it("the line only grows as doses are taken", () => {
    const fills = [0, 1, 2, 3].map((n) => timelineFill(n, 3));
    expect([...fills].sort((a, b) => a - b)).toEqual(fills);
  });
});

describe("Reading save button", () => {
  const ok = checkReading({ kind: "bp", top: 128, bottom: 80 }).level;
  const danger = checkReading({ kind: "bp", top: 190, bottom: 100 }).level;
  const empty = checkReading({ kind: "bp", top: null, bottom: 80 }).level;

  it("is disabled while empty", () => {
    expect(saveButton(empty, false)).toEqual({
      disabled: true,
      help: false,
      label: "Save reading",
    });
  });
  it("saves an ok reading", () => {
    expect(saveButton(ok, false)).toEqual({ disabled: false, help: false, label: "Save reading" });
  });
  it("turns to help on a danger reading", () => {
    expect(saveButton(danger, false)).toEqual({
      disabled: false,
      help: true,
      label: "Save and get help",
    });
  });
  it("chest pain alone goes for help even with no number", () => {
    expect(saveButton(empty, true)).toEqual({
      disabled: false,
      help: true,
      label: "Save and get help",
    });
    expect(saveButton(ok, true).label).toBe("Save and get help");
  });
});
