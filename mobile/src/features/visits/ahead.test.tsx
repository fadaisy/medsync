import type { HomeV2Props } from "@/features/v2/home";
import type { AheadRead } from "@/features/visits/logic";
import { stageOf } from "@patient-core/visit-stages";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { HomeV2View } from "@/features/v2/home";
import { VisitDay } from "@/features/v2/visit-day";
import { AheadLines } from "@/features/visits/ahead";
import { AHEAD_NOTE, visitMayHaveAhead } from "@/features/visits/logic";
import { ThemeProvider } from "@/theme/theme";

/**
 * "N ahead of you" on the booked visit, once the patient is at the hospital (ADR 0084 §6, owner approved
 * 19 Nov 2026): the shared line, Home's visit card on the day and the visit page. Present with a count, present
 * with no one ahead, not present, and a failed read.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

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

const TICKET = {
  hospitalName: "Kampala General Hospital",
  hospitalInitials: "KG",
  day: "19",
  dayLine: "Thursday · November",
  window: "08:00 to 10:00",
  doctorTime: false,
  clinic: "General OPD",
  room: null,
  patient: "Esther N.",
  block: null,
  pay: { kind: "free" as const },
  code: "K7M 42Q",
};

const home = (ahead: AheadRead | null | undefined, today = true): HomeV2Props => ({
  visit: { state: "ready", ticket: TICKET, stage: stageOf("arrived", null), today, ahead },
  results: { state: "off" },
  household: [],
  careLink: true,
  onOpenVisit: jest.fn(),
  onRetryVisit: jest.fn(),
  onBookToday: jest.fn(),
  onBookDay: jest.fn(),
  onResults: jest.fn(),
  onBookFor: jest.fn(),
  onAddSomeone: jest.fn(),
  onCare: jest.fn(),
  onReadings: jest.fn(),
  onMedicines: jest.fn(),
  onWellness: jest.fn(),
});

const day = (ahead: AheadRead | null, onCheckAhead = jest.fn()) => (
  <VisitDay
    ticket={TICKET}
    stage={stageOf("arrived", null)}
    stageTimes={[null, null, null, null, null]}
    ahead={ahead}
    onCheckAhead={onCheckAhead}
    calledRoom={null}
    questions={[]}
    nurseNote={null}
    onAddQuestion={jest.fn()}
    onMarkQuestion={jest.fn()}
    onAction={jest.fn()}
  />
);

/** Nothing about a place in the line is on screen. */
const noCount = () => {
  expect(screen.queryByText(/ahead of you/)).toBeNull();
  expect(screen.queryByText(AHEAD_NOTE)).toBeNull();
};

jest.setTimeout(30_000);

describe("the ahead line", () => {
  it("present with a count: the number ahead and why it can move", async () => {
    await wrap(<AheadLines status="awaiting_triage" ahead={4} />);
    expect(screen.getByText("4 ahead of you")).toBeTruthy();
    expect(screen.getByText(AHEAD_NOTE)).toBeTruthy();
  });

  it("present with no one ahead: says so in words", async () => {
    await wrap(<AheadLines status="arrived" ahead={0} />);
    expect(screen.getByText("No one is ahead of you.")).toBeTruthy();
    expect(screen.getByText(AHEAD_NOTE)).toBeTruthy();
  });

  it("not present: nothing", async () => {
    await wrap(<AheadLines status="declared" ahead={4} />);
    noCount();
  });

  it("a failed read: nothing, never a 0", async () => {
    await wrap(<AheadLines status="arrived" ahead={null} />);
    noCount();
    expect(screen.queryByText(/\b0\b/)).toBeNull();
  });
});

describe("Home's visit card on the day", () => {
  it("present with a count: under the stage, which stays", async () => {
    await wrap(<HomeV2View {...home({ status: "awaiting_triage", ahead: 3 })} />);
    expect(screen.getByText("Here")).toBeTruthy();
    expect(screen.getByText("3 ahead of you")).toBeTruthy();
    expect(screen.getByText(AHEAD_NOTE)).toBeTruthy();
  });

  it("present with no one ahead", async () => {
    await wrap(<HomeV2View {...home({ status: "arrived", ahead: 0 })} />);
    expect(screen.getByText("No one is ahead of you.")).toBeTruthy();
  });

  it("not present: the card as before, with no count", async () => {
    await wrap(<HomeV2View {...home(undefined)} />);
    expect(screen.getByText("Here")).toBeTruthy();
    noCount();
  });

  it("a failed read: no count", async () => {
    await wrap(<HomeV2View {...home(null)} />);
    expect(screen.getByText("Here")).toBeTruthy();
    noCount();
  });

  it("another day's visit never carries a count", async () => {
    await wrap(<HomeV2View {...home({ status: "arrived", ahead: 3 }, false)} />);
    noCount();
  });
});

describe("the visit page", () => {
  it("present with a count: under where you are, with the patient's own Check again", async () => {
    const check = jest.fn();
    await wrap(day({ status: "awaiting_triage", ahead: 2 }, check));
    expect(screen.getByText("Where you are")).toBeTruthy();
    expect(screen.getByText("2 ahead of you")).toBeTruthy();
    expect(screen.getByText(AHEAD_NOTE)).toBeTruthy();
    await fireEvent.press(screen.getByText("Check again"));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("present with no one ahead", async () => {
    await wrap(day({ status: "arrived", ahead: 0 }));
    expect(screen.getByText("No one is ahead of you.")).toBeTruthy();
  });

  it("not present, or a failed read: nothing, and no Check again", async () => {
    await wrap(day(null));
    noCount();
    expect(screen.queryByText("Check again")).toBeNull();
  });
});

describe("which booked visits are asked about", () => {
  const now = new Date("2026-11-19T07:00:00.000Z");
  const v = {
    status: "arrived",
    forMember: null,
    type: "in_person",
    startsAtIso: "2026-11-19T06:00:00.000Z",
  };

  it("the patient's own, in person, today, and checked in", () => {
    expect(visitMayHaveAhead(v, now)).toBe(true);
  });

  it("not before arrival, not another day, not a member's, not a virtual visit", () => {
    expect(visitMayHaveAhead({ ...v, status: "confirmed" }, now)).toBe(false);
    expect(visitMayHaveAhead({ ...v, startsAtIso: "2026-11-20T06:00:00.000Z" }, now)).toBe(false);
    expect(visitMayHaveAhead({ ...v, forMember: "Mother" }, now)).toBe(false);
    expect(visitMayHaveAhead({ ...v, type: "virtual" }, now)).toBe(false);
  });
});
