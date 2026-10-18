import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { HealthCard } from "@/components/tide/health-card";
import { ThemeProvider } from "@/theme/theme";

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const data = {
  holder: "[Name]",
  number: "MS 2026 00042",
  facility: "[Hospital]",
  age: "34 years",
  conditions: null,
  allergies: "Penicillins",
  nextOfKin: null,
  ifFound: "If found, please return it to [Hospital]",
};

describe("health card back (ADR 0355)", () => {
  it("is its own face: the number, allergies, hidden conditions and who to call; a tap turns it", async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <HealthCard data={data} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    // The back is hidden from screen readers (and so from queries) until the card is turned.
    expect(screen.queryByText("MEDSYNC NUMBER")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Health card, front. Tap to turn over"));
    expect(screen.getByLabelText("Health card, back. Tap to turn over")).toBeTruthy();
    expect(screen.getByText("MEDSYNC NUMBER")).toBeTruthy();
    expect(screen.getByText("Penicillins")).toBeTruthy();
    expect(screen.getByText("Hidden by the card holder")).toBeTruthy();
    expect(screen.getByText("If found, please return it to [Hospital]")).toBeTruthy();
    // No next of kin known: no row, rather than a guess.
    expect(screen.queryByText("Next of kin")).toBeNull();
  });
});
