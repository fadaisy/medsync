import type { TetherCardData } from "@/components/tide/tether-card";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TetherCard } from "@/components/tide/tether-card";
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

const data: TetherCardData = {
  holder: "[Name]",
  number: "MS 2026 00042",
  facility: "[Hospital]",
  age: "34 years",
  sex: "F",
  conditions: null,
  allergies: "Penicillins",
  nextOfKin: null,
  ifFound: "If found, please return it to [Hospital]",
};

jest.setTimeout(30_000);

describe("the one card on Me: membership on the front, the Medical ID on the back", () => {
  it("the front says who the holder is to Tether, with the plan when it is known", async () => {
    await wrap(<TetherCard data={data} tier="plus_care" qr={null} />);
    expect(screen.getByText("Tether")).toBeTruthy();
    expect(screen.getByText("Plus Care")).toBeTruthy();
    expect(screen.getByLabelText("Number MS 2026 00042")).toBeTruthy();
    expect(screen.getByText("[Name]")).toBeTruthy();
    expect(screen.getByText("[Hospital] · 34 years · F")).toBeTruthy();
    // The turn is written on the card, not left to be guessed.
    expect(screen.getByText("Turn over")).toBeTruthy();
    // The back is hidden from screen readers (and so from queries) until the card is turned.
    expect(screen.queryByText("Medical ID")).toBeNull();
  });

  it("the back keeps everything the health card's back carried; a tap turns it", async () => {
    await wrap(<TetherCard data={data} tier="basic" qr={null} />);
    await fireEvent.press(screen.getByLabelText("Tether card, front. Turn over"));
    expect(screen.getByLabelText("Tether card, Medical ID. Turn back")).toBeTruthy();
    expect(screen.getByText("Medical ID")).toBeTruthy();
    expect(screen.getByLabelText("Tether number MS 2026 00042")).toBeTruthy();
    expect(screen.getByText("Penicillins")).toBeTruthy();
    // Conditions stay off the card unless the holder shows them (PRD Q6).
    expect(screen.getByText("Hidden by the card holder")).toBeTruthy();
    expect(screen.getByText("If found, please return it to [Hospital]")).toBeTruthy();
    expect(
      screen.getByText("Written by the card holder · not confirmed by a clinician"),
    ).toBeTruthy();
    // No next of kin known: no row, rather than a guess. No blood group: the record holds none.
    expect(screen.queryByText("Next of kin")).toBeNull();
    expect(screen.queryByText("Blood group")).toBeNull();
  });

  it("shows the conditions and the next of kin when there is something to show", async () => {
    await wrap(
      <TetherCard
        data={{ ...data, conditions: "Asthma", nextOfKin: "On file at [Hospital]" }}
        tier="basic"
        qr={null}
      />,
    );
    await fireEvent.press(screen.getByLabelText("Tether card, front. Turn over"));
    expect(screen.getByText("Asthma")).toBeTruthy();
    expect(screen.queryByText("Hidden by the card holder")).toBeNull();
    expect(screen.getByText("On file at [Hospital]")).toBeTruthy();
  });

  it("with no connection it is still the whole card: no plan and no code, every other line as usual", async () => {
    await wrap(<TetherCard data={data} tier={null} qr={null} />);
    expect(screen.queryByText("Basic")).toBeNull();
    expect(screen.getByText("[Name]")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Tether card, front. Turn over"));
    expect(screen.getByText("Penicillins")).toBeTruthy();
    // The note about the code shows only beside a code.
    expect(screen.queryByText("This code works for a short time only.")).toBeNull();
  });

  it("draws the short-lived code on the back when there is one, with its note", async () => {
    await wrap(<TetherCard data={data} tier="plus_family" qr={<Text>the code</Text>} />);
    await fireEvent.press(screen.getByLabelText("Tether card, front. Turn over"));
    expect(screen.getByText("the code")).toBeTruthy();
    expect(screen.getByText("This code works for a short time only.")).toBeTruthy();
  });
});
