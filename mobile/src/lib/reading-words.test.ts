import { readSpoken } from "@/lib/reading-words";

describe("numbers out of a spoken reading", () => {
  it("reads blood pressure and pulse however it is said", () => {
    expect(readSpoken("bp", "120 over 80 pulse 72")).toEqual({
      top: "120",
      bottom: "80",
      pulse: "72",
    });
    expect(readSpoken("bp", "My pressure is 135/88")).toEqual({ top: "135", bottom: "88" });
    expect(readSpoken("bp", "140 90 66")).toEqual({ top: "140", bottom: "90", pulse: "66" });
    expect(readSpoken("bp", "heart rate 70, 118 over 76")).toEqual({
      top: "118",
      bottom: "76",
      pulse: "70",
    });
  });

  it("fills nothing it cannot place", () => {
    expect(readSpoken("bp", "80 over 120")).toEqual({});
    expect(readSpoken("sugar", "I forgot")).toEqual({});
  });

  it("reads sugar in mmol/L, turning mg/dL into it", () => {
    expect(readSpoken("sugar", "6.4")).toEqual({ sugar: "6.4" });
    expect(readSpoken("sugar", "6,4")).toEqual({ sugar: "6.4" });
    expect(readSpoken("sugar", "126 milligrams")).toEqual({ sugar: "7.0" });
  });

  it("reads weight in kg, turning pounds into it", () => {
    expect(readSpoken("weight", "70.5 kilos")).toEqual({ weight: "70.5" });
    expect(readSpoken("weight", "154 pounds")).toEqual({ weight: "70.0" });
  });
});
