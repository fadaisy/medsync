import type { VisitRowV2 } from "@/features/v2/visits-list";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { VisitsList } from "@/features/v2/visits-list";
import { ThemeProvider } from "@/theme/theme";

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

const row = (over: Partial<VisitRowV2>): VisitRowV2 => ({
  id: "u1",
  day: "16",
  dayLabel: "MON",
  clinic: "General OPD",
  who: "You",
  window: "08:00 to 10:00",
  code: "K7M 42Q",
  chip: "paid_app",
  ...over,
});
const OWN = row({});
const CHILD = row({
  id: "u2",
  day: "18",
  clinic: "Dental Clinic",
  who: "Moses",
  chip: "at_hospital",
});
const PAST = row({ id: "p1", day: "2", clinic: "Eye Clinic", chip: "none" });

jest.setTimeout(30_000);

describe("Visits v2 on the phone: one list for everyone, filtered by person", () => {
  it("shows each visit with who it is for, its code and how it is paid, and opens the one tapped", async () => {
    const onOpen = jest.fn();
    await wrap(
      <VisitsList
        offers={[]}
        upcoming={[OWN, CHILD]}
        past={[PAST]}
        onOpen={onOpen}
        onOffer={jest.fn()}
      />,
    );
    expect(screen.getByText("You · 08:00 to 10:00")).toBeTruthy();
    expect(screen.getByText("Paid in the app")).toBeTruthy();
    expect(screen.getByText("Pays at the hospital")).toBeTruthy();
    expect(screen.getAllByText("K7M 42Q")).toHaveLength(2);
    await fireEvent.press(screen.getByText("Dental Clinic"));
    expect(onOpen).toHaveBeenCalledWith("u2");
    await fireEvent.press(screen.getByText("Eye Clinic"));
    expect(onOpen).toHaveBeenCalledWith("p1");
  });

  it("the filter narrows the list to one person, and All brings everyone back", async () => {
    await wrap(
      <VisitsList
        offers={[]}
        upcoming={[OWN, CHILD]}
        past={[PAST]}
        onOpen={jest.fn()}
        onOffer={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Moses"));
    expect(screen.queryByText("General OPD")).toBeNull();
    expect(screen.queryByText("Eye Clinic")).toBeNull();
    expect(screen.getByText("Dental Clinic")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("All"));
    expect(screen.getByText("General OPD")).toBeTruthy();
  });

  it("with one person there is no filter, and with nothing booked it says so", async () => {
    await wrap(
      <VisitsList offers={[]} upcoming={[]} past={[PAST]} onOpen={jest.fn()} onOffer={jest.fn()} />,
    );
    expect(screen.queryByLabelText("All")).toBeNull();
    expect(screen.getByText("Nothing booked.")).toBeTruthy();
  });

  it("what needs an answer comes first, and each answer is passed on", async () => {
    const onOffer = jest.fn();
    await wrap(
      <VisitsList
        offers={[{ id: "o1", title: "Eye Clinic moved", line: "Next open day: Tue 24 Nov." }]}
        upcoming={[OWN]}
        past={[]}
        onOpen={jest.fn()}
        onOffer={onOffer}
      />,
    );
    expect(screen.getByText("Needs your answer")).toBeTruthy();
    await fireEvent.press(screen.getByText("Keep"));
    await fireEvent.press(screen.getByText("Pick another day"));
    await fireEvent.press(screen.getByText("Cancel"));
    expect(onOffer.mock.calls).toEqual([
      ["o1", "keep"],
      ["o1", "pick"],
      ["o1", "cancel"],
    ]);
  });
});
