import type { HomeV2Props, HomeVisit } from "@/features/v2/home";
import type { HomeTrend } from "@/features/v2/home-top";
import type { TodayState } from "@patient-core/today-hero";
import rules from "@clinical-rules/patient-thresholds.v0.json";
import { CARE_V2_COPY } from "@content/patient-app/care";
import { targetBand } from "@patient-core/care-trends";
import { targetMarks } from "@patient-core/reading-cards";
import { heroFor } from "@patient-core/today-hero";
import { stageOf } from "@patient-core/visit-stages";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { laneScale, trendFrame } from "@/components/tide/trend-lanes";
import { HomeV2View } from "@/features/v2/home";
import { dayStatus, homeTop } from "@/features/v2/home-top";
import { ThemeProvider } from "@/theme/theme";
import { tideLight } from "@/theme/tide";

/**
 * Home's top card in Care mode (behind `careMode`, locked until Gate CG): the rule, the row that keeps the visit
 * in sight, and the trend card's words. Every reading here is made up and belongs to nobody. The targets are
 * read from `targetMarks`, so no clinical number is written in this file.
 */
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const frame = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider>{ui}</ThemeProvider>
  </SafeAreaProvider>
);
const wrap = (ui: React.ReactElement) => render(frame(ui));

const TICKET = {
  hospitalName: "Kampala General Hospital",
  hospitalInitials: "KG",
  day: "16",
  dayLine: "Monday · November",
  window: "08:00 to 10:00",
  doctorTime: false,
  clinic: "General OPD",
  room: null,
  patient: "Esther N.",
  block: null,
  pay: { kind: "free" as const },
  code: "K7M 42Q",
};
const FAR: HomeVisit = {
  state: "ready",
  ticket: TICKET,
  stage: stageOf("booked", null),
  today: false,
  tomorrow: false,
};
const TOMORROW: HomeVisit = { ...FAR, tomorrow: true };
const TODAY: HomeVisit = { ...FAR, stage: stageOf("arrived", "line"), today: true };

const QUIET: TodayState = {
  danger: null,
  teamAsks: null,
  dueNow: null,
  visitToday: null,
  nextItem: null,
  nothingUntil: null,
};
const DANGER: TodayState["danger"] = { kind: "very_high_bp", at: "09:10" };
const ASK: TodayState["teamAsks"] = { id: "a1", from: CARE_V2_COPY.hero.teamFrom, at: "x" };
const DUE: TodayState["dueNow"] = {
  kind: "dose",
  key: "m@08:00",
  label: "Metformin",
  dueAt: "08:00",
};

const [TOP, BOTTOM] = targetMarks("bp", "fasting").lines.map((l) => l.value) as [number, number];
const SUGAR = targetMarks("sugar", "fasting").band!;
/** Readings a little inside, over and under the sugar band, to one decimal place as a meter shows them. */
const r1 = (n: number) => Math.round(n * 10) / 10;
const SUGAR_IN = r1(SUGAR.hi - 0.4);
const SUGAR_OVER = r1(SUGAR.hi + 0.6);
const SUGAR_LOW = r1(SUGAR.lo - 0.8);
/** A top number a little under the app's own low line (the bottom of its band), with the bottom number in range. */
const BP_LOW_TOP = targetBand("bp", "fasting")!.lo - 4;
/** A top number a little under the rules file's "Too low" line. */
const BP_TOO_LOW_TOP = rules.bp.dangerLowTopBelow - 4;

const WEEK = ["13", "14", "15", "16", "17", "18", "19"].map((d) => ({
  date: `${d} Nov`,
  dayKey: `2026-11-${d}`,
}));
const days = (values: (number | null)[], bottoms?: (number | null)[]) =>
  WEEK.map((d, i) => ({
    ...d,
    value: values[i] ?? null,
    ...(bottoms ? { bottom: bottoms[i] ?? null } : {}),
  }));
/** In target today; over on the top number on the 14th; over on the bottom number only on the 16th. */
const BP: HomeTrend = {
  metric: "bp",
  ctx: "fasting",
  unit: "mmHg",
  days: days(
    [TOP - 4, TOP + 2, null, TOP - 8, TOP - 6, null, TOP - 12],
    [BOTTOM - 6, BOTTOM - 2, null, BOTTOM + 2, BOTTOM - 6, null, BOTTOM - 10],
  ),
  weekAgo: TOP - 4,
};

const handlers = () => ({
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
const base = (over: Partial<HomeV2Props> = {}): HomeV2Props => ({
  visit: { state: "none" },
  results: { state: "off" },
  household: [],
  careLink: false,
  ...handlers(),
  ...over,
});
const ready = (today: Partial<TodayState> = {}, trend: HomeTrend | null = BP) => ({
  state: "ready" as const,
  today: { ...QUIET, ...today },
  trend,
  onHeroAction: jest.fn(),
  onLog: jest.fn(),
  onSeeAll: jest.fn(),
});
const row = () => screen.queryByTestId("home-visit-row");

jest.setTimeout(30_000);

describe("which card is on top (homeTop)", () => {
  const top = (today: Partial<TodayState> | null, visit: HomeVisit, trend = true) =>
    homeTop({ today: today ? { ...QUIET, ...today } : null, visit, trend }).kind;

  it("goes down the ladder: danger, the team, due now, a near visit, the week's readings, the visit", () => {
    expect(top({ danger: DANGER, teamAsks: ASK, dueNow: DUE }, TODAY)).toBe("danger");
    expect(top({ teamAsks: ASK, dueNow: DUE }, TODAY)).toBe("team");
    expect(top({ dueNow: DUE }, TODAY)).toBe("due");
    expect(top({}, TODAY)).toBe("visit");
    expect(top({}, FAR)).toBe("trends");
    expect(top({}, FAR, false)).toBe("visit");
    expect(top({}, { state: "none" })).toBe("trends");
    expect(top({}, { state: "none" }, false)).toBe("visit");
  });

  it("a near visit (today or tomorrow) beats the trends; a far one does not", () => {
    expect(top({}, TODAY)).toBe("visit");
    expect(top({}, TOMORROW)).toBe("visit");
    expect(top({}, FAR)).toBe("trends");
    // What is next on the plan, or nothing due, does not take the card from either.
    const next = { nextItem: { kind: "dose" as const, label: "Amlodipine", at: "20:00" } };
    expect(top(next, TOMORROW)).toBe("visit");
    expect(top(next, FAR)).toBe("trends");
  });

  it("a visit not read yet, or one that could not be read, keeps the card from the trends, never from a danger", () => {
    expect(top({}, { state: "loading" })).toBe("visit");
    expect(top({}, { state: "failed" })).toBe("visit");
    expect(top({ danger: DANGER }, { state: "loading" })).toBe("danger");
    expect(top({ dueNow: DUE }, { state: "failed" })).toBe("due");
  });

  it("with no care programme it is the visit card, whatever else is true", () => {
    expect(top(null, FAR)).toBe("visit");
    expect(top(null, { state: "none" })).toBe("visit");
  });

  it("never disagrees with the app's own ladder on its first rungs", () => {
    for (const danger of [null, DANGER])
      for (const teamAsks of [null, ASK])
        for (const dueNow of [null, DUE])
          for (const visit of [FAR, TOMORROW, TODAY, { state: "none" } as HomeVisit]) {
            const today = { ...QUIET, danger, teamAsks, dueNow };
            const hero = heroFor(today);
            const got = homeTop({ today, visit, trend: true });
            if (hero.rung <= 3) expect(got).toEqual({ kind: hero.kind, hero });
            else expect(["visit", "trends"]).toContain(got.kind);
          }
    // The ladder's own "visit today" rung is the visit card here too.
    const visitToday = { appointmentId: "a1", window: "08:00 to 10:00" };
    expect(top({ visitToday }, FAR)).toBe("visit");
  });
});

describe("a day against its target (dayStatus)", () => {
  it("blood pressure is above target when either number is at or over its own line", () => {
    expect(dayStatus("bp", "fasting", TOP - 1, BOTTOM - 1).kind).toBe("in");
    expect(dayStatus("bp", "fasting", TOP + 2, BOTTOM - 6).kind).toBe("above");
    // Only the bottom number is over.
    expect(dayStatus("bp", "fasting", TOP - 8, BOTTOM + 2).kind).toBe("above");
    expect(dayStatus("bp", "fasting", TOP, BOTTOM - 10).kind).toBe("above");
    expect(dayStatus("bp", "fasting", TOP - 10, BOTTOM).kind).toBe("above");
  });

  it("sugar is judged against its band, and a low reading is never called in target or above it", () => {
    expect(dayStatus("sugar", "fasting", SUGAR.hi).kind).toBe("in");
    expect(dayStatus("sugar", "fasting", SUGAR_OVER).kind).toBe("above");
    const low = dayStatus("sugar", "fasting", SUGAR_LOW);
    expect(low.kind).toBe("other");
    // The word is the app's own for that reading, not one written here.
    expect(low.kind === "other" ? low.word : "").toBeTruthy();
    expect(low.kind === "other" ? low.word : "").not.toBe(CARE_V2_COPY.readings.outOfTarget);
  });

  it('a reading the check calls a danger is "Too low" in the critical tone; "Low" stays amber', () => {
    // The rule is the app's own (`checkReading` and `judge`): no line is drawn here.
    expect(dayStatus("sugar", "fasting", SUGAR_LOW)).toEqual({
      kind: "other",
      word: "Too low",
      tone: "critical",
    });
    expect(dayStatus("bp", "fasting", BP_LOW_TOP, BOTTOM - 20)).toEqual({
      kind: "other",
      word: "Low",
      tone: "caution",
    });
  });

  it('a blood pressure the check calls too low is "Too low" in the critical tone (thresholds 0.3.0, pending CSO)', () => {
    expect(dayStatus("bp", "fasting", BP_TOO_LOW_TOP, BOTTOM - 40)).toEqual({
      kind: "other",
      word: "Too low",
      tone: "critical",
    });
  });

  it("no reading is no reading, and weight is a trend that is never judged", () => {
    expect(dayStatus("bp", "fasting", null).kind).toBe("none");
    expect(dayStatus("weight", "fasting", 82).kind).toBe("untargeted");
  });
});

describe("Home with Care mode off", () => {
  it("is the visit card with no row under it, as before", async () => {
    const p = base({ visit: FAR, careLink: true });
    const view = await wrap(<HomeV2View {...p} />);
    expect(screen.getByText("Your next visit")).toBeTruthy();
    expect(screen.getByText("Monday 16 November")).toBeTruthy();
    expect(screen.getByText("Open your visit")).toBeTruthy();
    expect(row()).toBeNull();
    expect(screen.queryByText("Health trends")).toBeNull();
    const plain = JSON.stringify(view.toJSON());
    // Someone with no care programme, in Care mode, sees the very same page.
    await view.rerender(frame(<HomeV2View {...p} care={{ state: "none" }} />));
    expect(JSON.stringify(view.toJSON())).toBe(plain);
  });

  it("with nothing booked it is still the two ways to book, and no row", async () => {
    await wrap(<HomeV2View {...base()} />);
    expect(screen.getByText("No visit booked")).toBeTruthy();
    expect(screen.getByText("Ask for a day")).toBeTruthy();
    expect(screen.getByText("Come today")).toBeTruthy();
    expect(row()).toBeNull();
  });
});

describe("Home's top card in Care mode", () => {
  it("waits while the care rows load, so the card never shows the visit and then swaps", async () => {
    await wrap(<HomeV2View {...base({ visit: FAR, care: { state: "loading" } })} />);
    expect(screen.getByLabelText("Loading your visits")).toBeTruthy();
    expect(screen.queryByText("Your next visit")).toBeNull();
    expect(row()).toBeNull();
  });

  it("a reading that needs action is the card, and the next visit is in the row under it", async () => {
    const care = ready({ danger: DANGER, dueNow: DUE });
    const p = base({ visit: FAR, care });
    await wrap(<HomeV2View {...p} />);
    expect(screen.getByText(CARE_V2_COPY.hero.danger)).toBeTruthy();
    expect(screen.queryByText(CARE_V2_COPY.hero.due)).toBeNull();
    await fireEvent.press(screen.getByText(CARE_V2_COPY.hero.dangerAction));
    expect(care.onHeroAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "danger" }));
    // The visit card is not drawn twice: its button is gone, and the row carries the day and the clinic.
    expect(screen.queryByText("Open your visit")).toBeNull();
    expect(screen.getByText("Your next visit")).toBeTruthy();
    expect(screen.getByText("Monday 16 November · General OPD")).toBeTruthy();
    // A far visit's code stays on the visit page.
    expect(screen.queryByText("K7M 42Q")).toBeNull();
    await fireEvent.press(row()!);
    expect(p.onOpenVisit).toHaveBeenCalledTimes(1);
  });

  it("something due now is the card; today's visit is in the row with its code and its stage in words", async () => {
    const care = ready({ dueNow: DUE });
    const p = base({ visit: TODAY, care });
    await wrap(<HomeV2View {...p} />);
    expect(screen.getByText(CARE_V2_COPY.hero.due)).toBeTruthy();
    expect(screen.getByText("Metformin · 08:00")).toBeTruthy();
    await fireEvent.press(screen.getByText(CARE_V2_COPY.hero.dueAction));
    expect(care.onHeroAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "due" }));
    expect(screen.getByText("Today's visit")).toBeTruthy();
    expect(screen.getByText("K7M 42Q")).toBeTruthy();
    const stage = stageOf("arrived", "line").label;
    expect(screen.getByLabelText(`Today's visit. ${stage}. K, 7, M. 4, 2, Q`)).toBeTruthy();
    // The stage is words, never a number (MR4).
    expect(screen.queryByText(/step \d|\d of \d/i)).toBeNull();
  });

  it("a question from the care team is the card; with nothing booked the row leads to booking", async () => {
    const care = ready({ teamAsks: ASK });
    const p = base({ care });
    await wrap(<HomeV2View {...p} />);
    expect(screen.getByText(CARE_V2_COPY.hero.team)).toBeTruthy();
    await fireEvent.press(screen.getByText(CARE_V2_COPY.hero.teamAction));
    expect(care.onHeroAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "team" }));
    expect(screen.getByText("No visit booked")).toBeTruthy();
    await fireEvent.press(row()!);
    expect(p.onBookDay).toHaveBeenCalledTimes(1);
  });

  it("tomorrow's visit in the row carries its code; a failed load says so and tries again", async () => {
    const p = base({ visit: TOMORROW, care: ready({ teamAsks: ASK }) });
    const view = await wrap(<HomeV2View {...p} />);
    expect(screen.getByText("Your next visit")).toBeTruthy();
    expect(screen.getByText("K7M 42Q")).toBeTruthy();

    await view.rerender(frame(<HomeV2View {...p} visit={{ state: "failed" }} />));
    expect(screen.getByText("Couldn't load your visits. Check your connection.")).toBeTruthy();
    expect(screen.queryByText("No visit booked")).toBeNull();
    await fireEvent.press(row()!);
    expect(p.onRetryVisit).toHaveBeenCalledTimes(1);

    // Still loading: the row waits for the answer rather than guessing.
    await view.rerender(frame(<HomeV2View {...p} visit={{ state: "loading" }} />));
    expect(screen.getByText(CARE_V2_COPY.hero.team)).toBeTruthy();
    expect(row()).toBeNull();
  });

  it("the week's readings are the card when the visit is far, and the visit takes it back when it is near", async () => {
    const p = base({ visit: FAR, care: ready() });
    const view = await wrap(<HomeV2View {...p} />);
    expect(screen.getByText("Health trends")).toBeTruthy();
    expect(screen.getByText("Blood pressure")).toBeTruthy();
    expect(screen.getByText("Your next visit")).toBeTruthy();
    expect(row()).not.toBeNull();

    await view.rerender(frame(<HomeV2View {...p} visit={TOMORROW} />));
    expect(screen.queryByText("Health trends")).toBeNull();
    expect(screen.getByText("Open your visit")).toBeTruthy();
    expect(row()).toBeNull();
  });
});

describe("the trend card", () => {
  const open = async (trend: HomeTrend) => {
    const care = ready({}, trend);
    await wrap(<HomeV2View {...base({ visit: FAR, care })} />);
    return care;
  };
  const hidden = { includeHiddenElements: true };

  it("opens on the latest reading: both numbers, in target in words, and the change over a week", async () => {
    const care = await open(BP);
    expect(screen.getByText(`${TOP - 12}/${BOTTOM - 10}`)).toBeTruthy();
    expect(screen.getByText("mmHg")).toBeTruthy();
    expect(screen.getByText("In target")).toBeTruthy();
    expect(screen.getByText("Today · tap a day")).toBeTruthy();
    // The app's own words for the change (`weekChange`), with its arrow.
    expect(screen.getByLabelText("↓ 8 in a week")).toBeTruthy();
    expect(screen.getByText("8 in a week")).toBeTruthy();
    // Two lanes, named, with the target marked.
    expect(screen.getByText("Top number", hidden)).toBeTruthy();
    expect(screen.getByText("Bottom number", hidden)).toBeTruthy();
    expect(screen.getByText("Target", hidden)).toBeTruthy();

    await fireEvent.press(screen.getByText("Log a reading"));
    expect(care.onLog).toHaveBeenCalledWith("bp");
    await fireEvent.press(screen.getByText("See all"));
    expect(care.onSeeAll).toHaveBeenCalledTimes(1);
  });

  it("tapping a day reads that day: above target in words, and the week's change steps aside", async () => {
    await open(BP);
    await fireEvent.press(
      screen.getByLabelText(
        `14 Nov: Top number ${TOP + 2}, Bottom number ${BOTTOM - 2} mmHg, Above target`,
      ),
    );
    expect(screen.getByText(`${TOP + 2}/${BOTTOM - 2}`)).toBeTruthy();
    expect(screen.getByText("Above target")).toBeTruthy();
    expect(screen.queryByText("In target")).toBeNull();
    expect(screen.getByText("14 Nov · tap a day")).toBeTruthy();
    expect(screen.queryByText("8 in a week")).toBeNull();
  });

  it("a day is above target when only the bottom number is over", async () => {
    await open(BP);
    const day = screen.getByLabelText(
      `16 Nov: Top number ${TOP - 8}, Bottom number ${BOTTOM + 2} mmHg, Above target`,
    );
    await fireEvent.press(day);
    expect(screen.getByText(`${TOP - 8}/${BOTTOM + 2}`)).toBeTruthy();
    expect(screen.getByText("Above target")).toBeTruthy();
  });

  it("a day with no reading is said to be one, and reads as a dash, never a number", async () => {
    await open(BP);
    const gap = screen.getByLabelText("15 Nov: No reading yet");
    expect(gap.props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByLabelText("18 Nov: No reading yet")).toBeTruthy();
    await fireEvent.press(gap);
    expect(screen.getByLabelText("15 Nov: No reading yet").props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByText("No reading yet")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("In target")).toBeNull();
    expect(screen.queryByText("Above target")).toBeNull();
  });

  it("with no reading all week it says so and still offers to log one", async () => {
    await open({ ...BP, days: days([]), weekAgo: null });
    expect(screen.getByText("No reading yet")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByLabelText("Today: No reading yet")).toBeTruthy();
    expect(screen.getByText("Log a reading")).toBeTruthy();
    expect(screen.queryByText("Start logging readings")).toBeNull();
  });

  it('with no reading at all the button reads "Start logging readings" and opens the same logging', async () => {
    const care = { ...ready({}, { ...BP, days: days([]), weekAgo: null }), noReadings: true };
    await wrap(<HomeV2View {...base({ visit: FAR, care })} />);
    expect(screen.queryByText("Log a reading")).toBeNull();
    await fireEvent.press(screen.getByText("Start logging readings"));
    expect(care.onLog).toHaveBeenCalledWith("bp");
  });

  it('with a reading the button stays "Log a reading"', async () => {
    const care = { ...ready(), noReadings: false };
    await wrap(<HomeV2View {...base({ visit: FAR, care })} />);
    expect(screen.getByText("Log a reading")).toBeTruthy();
    expect(screen.queryByText("Start logging readings")).toBeNull();
  });

  /** The status pill's two colours: its words' and the fill of the pill around them. */
  const pill = (word: string) => {
    const text = screen.getByText(word);
    let tint: unknown;
    for (let node = text.parent; node && tint === undefined; node = node.parent)
      tint = StyleSheet.flatten(node.props.style)?.backgroundColor;
    return { text: StyleSheet.flatten(text.props.style).color, tint };
  };

  it('"Too low" is in the critical tone, with its words (CSO, 19 Nov 2026)', async () => {
    await open({
      metric: "sugar",
      ctx: "fasting",
      unit: "mmol/L",
      days: days([SUGAR_IN, null, null, null, null, null, SUGAR_LOW]),
      weekAgo: null,
    });
    expect(pill("Too low")).toEqual({
      text: tideLight.critical.text,
      tint: tideLight.critical.tint,
    });
    // The day still says so in words for a screen reader.
    expect(screen.getByLabelText(`Today: ${SUGAR_LOW} mmol/L, Too low`)).toBeTruthy();
  });

  it('"Low" and "Above target" stay amber', async () => {
    const amber = { text: tideLight.caution.text, tint: tideLight.caution.tint };
    await open({
      ...BP,
      days: days(
        [TOP + 2, null, null, null, null, null, BP_LOW_TOP],
        [BOTTOM - 2, null, null, null, null, null, BOTTOM - 20],
      ),
      weekAgo: null,
    });
    expect(pill("Low")).toEqual(amber);
    await fireEvent.press(
      screen.getByLabelText(
        `13 Nov: Top number ${TOP + 2}, Bottom number ${BOTTOM - 2} mmHg, Above target`,
      ),
    );
    expect(pill("Above target")).toEqual(amber);
  });

  it("sugar is one lane against its band; a low day takes the app's own word, in place of a target word", async () => {
    await open({
      metric: "sugar",
      ctx: "fasting",
      unit: "mmol/L",
      days: days([SUGAR_IN, SUGAR_LOW, null, null, null, null, SUGAR_OVER]),
      weekAgo: null,
    });
    expect(screen.getByText("Sugar")).toBeTruthy();
    expect(screen.getByText("Above target")).toBeTruthy();
    expect(screen.queryByText("Top number", hidden)).toBeNull();
    expect(screen.getByText("Target", hidden)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(`13 Nov: ${SUGAR_IN} mmol/L, In target`));
    expect(screen.getByText("In target")).toBeTruthy();
    const low = dayStatus("sugar", "fasting", SUGAR_LOW);
    const word = low.kind === "other" ? low.word : "";
    await fireEvent.press(screen.getByLabelText(`14 Nov: ${SUGAR_LOW} mmol/L, ${word}`));
    expect(screen.getByText(word)).toBeTruthy();
    expect(screen.queryByText("In target")).toBeNull();
    expect(screen.queryByText("Above target")).toBeNull();
  });

  it("weight has no target, so it is never called in or above one", async () => {
    await open({
      metric: "weight",
      ctx: "fasting",
      unit: "kg",
      days: days([82.4, null, 82.1, null, 81.9, null, 81.6]),
      weekAgo: null,
    });
    expect(screen.getByText("Weight")).toBeTruthy();
    expect(screen.getByText("81.6")).toBeTruthy();
    expect(screen.queryByText("In target")).toBeNull();
    expect(screen.queryByText("Above target")).toBeNull();
    expect(screen.queryByText("Target", hidden)).toBeNull();
    expect(screen.getByLabelText("13 Nov: 82.4 kg")).toBeTruthy();
  });
});

describe("the chart's lanes", () => {
  it("each lane has its own scale, so each target line sits inside its own lane", () => {
    const f = trendFrame(2);
    const [upper, lower] = f.plots as [(typeof f.plots)[number], (typeof f.plots)[number]];
    const top = laneScale({ values: BP.days.map((d) => d.value), line: TOP }, upper);
    const bottom = laneScale({ values: BP.days.map((d) => d.bottom ?? null), line: BOTTOM }, lower);
    for (const [y, plot] of [
      [top(TOP), upper],
      [bottom(BOTTOM), lower],
    ] as const) {
      expect(y).toBeGreaterThanOrEqual(plot.top);
      expect(y).toBeLessThanOrEqual(plot.bottom);
    }
    // The top number's lane is above the bottom number's, and they do not overlap.
    expect(upper.bottom).toBeLessThan(lower.top);
    // A higher reading is drawn higher.
    expect(top(TOP + 2)).toBeLessThan(top(TOP - 12));
    // A lane with nothing in it still has a scale.
    expect(Number.isFinite(laneScale({ values: [null, null] }, upper)(1))).toBe(true);
  });
});
