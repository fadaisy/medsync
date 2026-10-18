import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Ticket } from "@/components/tide/ticket";
import { TicketShareSheet } from "@/components/tide/ticket-share";
import { ThemeProvider } from "@/theme/theme";

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const base = {
  kind: "queue" as const,
  hospitalName: "[Hospital name]",
  stage: "In the line",
  aheadLine: "2 ahead of you",
  details: [{ label: "Time", value: "Not promised" }],
  code: "KWP-4827",
};

const show = async (fee: number | null, paid: boolean) =>
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <Ticket {...base} fee={fee} paid={paid} demoPayment={paid} onPayNow={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

describe("ticket place in line", () => {
  it("shows the stage and the ahead line, never a place number", async () => {
    await show(null, false);
    expect(screen.getByText("In the line")).toBeTruthy();
    expect(screen.getByText("2 ahead of you")).toBeTruthy();
    expect(screen.queryByText(/#\d/)).toBeNull();
  });

  it("hides the count when there is none", async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <Ticket {...base} aheadLine={null} fee={null} paid={false} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText("In the line")).toBeTruthy();
    expect(screen.queryByText(/ahead of you/)).toBeNull();
  });
});

describe("ticket payment looks", () => {
  it("no fee: the quiet strip, no stamp, no Pay now", async () => {
    await show(null, false);
    expect(screen.getByText("No fee")).toBeTruthy();
    expect(screen.queryByText("PAID")).toBeNull();
    expect(screen.queryByText("Pay now")).toBeNull();
  });

  it("not paid: Pay now, no stamp", async () => {
    await show(30000, false);
    expect(screen.getByText("Not paid · UGX 30,000")).toBeTruthy();
    expect(screen.getByText("Pay now")).toBeTruthy();
    expect(screen.queryByText("PAID")).toBeNull();
  });

  it("paid: the stamp, marked as a demo payment, and never an hour", async () => {
    await show(30000, true);
    expect(screen.getByText("PAID")).toBeTruthy();
    expect(screen.getByText("Demo payment · no money moved")).toBeTruthy();
    expect(screen.getByText("Not promised")).toBeTruthy();
    expect(screen.getByText("Show at the desk · works with no internet")).toBeTruthy();
  });
});

describe("ticket in the hand (ADR 0348)", () => {
  it("turns over to the back: the code for the desk and what to do there", async () => {
    await show(null, false);
    await fireEvent.press(screen.getByText("Turn over"));
    expect(screen.getByText("Show the front")).toBeTruthy();
    expect(screen.getByText("YOUR CODE")).toBeTruthy();
    expect(screen.getByText("Go to the reception desk when you arrive.")).toBeTruthy();
  });

  it("shares a picture with the hospital and the day, never the name, code, clinic or fee", async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <TicketShareSheet
            visible
            onClose={() => {}}
            ticket={{
              kind: "day",
              hospitalName: "[Hospital name]",
              day: "19",
              dayLine: "MON · OCT",
              sessionLine: "Morning",
              details: [
                { label: "Clinic", value: "[Clinic]" },
                { label: "Patient", value: "[First name] [Surname]" },
              ],
              fee: 50000,
              paid: false,
              code: "SMTC5N",
            }}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText("[Hospital name]")).toBeTruthy();
    expect(screen.getByText("19")).toBeTruthy();
    for (const hidden of ["SMTC5N", "[Clinic]", "[First name] [Surname]", /50,000/]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });
});
