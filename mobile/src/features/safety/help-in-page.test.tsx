import { startFlow } from "@patient-core/danger-flow";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import DangerScreen from "@/app/(app)/danger";
import { DangerFlowV2, helpInPageFor } from "@/features/v2/my-care";
import { DangerFlowBody } from "@/features/v2/my-care-routes";
import { ThemeProvider } from "@/theme/theme";
import { tideLight } from "@/theme/tide";

/**
 * ADR 0525 (amending law L6, owner 19 Nov 2026): a screen hides the header Help only while the page itself shows
 * a red Help that opens /help, in view, as its main action. The danger interrupt is the one new case: its first
 * step, and in Care mode the flow's "Get help now" steps. Each in-page button is red and opens /help.
 */
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ kind: "bp", value: "186/122" }),
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}));
jest.mock("@/lib/analytics", () => ({ track: jest.fn() }));
jest.mock("@/data/readings", () => ({ readingsRepo: { save: jest.fn(async () => "saved") } }));
jest.mock("@/data/care-v2", () => ({ loadCare: jest.fn() }));
jest.mock("@/data/my-care", () => ({ loadMyCare: jest.fn(), sendCareMessage: jest.fn() }));
jest.mock("@/offline/outbox", () => ({ newId: () => "id" }));
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);

const HEADER_HELP = "Help, emergency";

interface Node {
  props: { style?: unknown };
  children: readonly (Node | string)[];
}

/** Every background drawn in this node and under it. */
const fills = (n: Node): string[] => {
  const own = (
    StyleSheet.flatten(n.props.style as never) as { backgroundColor?: unknown } | undefined
  )?.backgroundColor;
  const kids = n.children.filter((c): c is Node => typeof c !== "string");
  return [...(typeof own === "string" ? [own] : []), ...kids.flatMap(fills)];
};

/** The backgrounds of the pressable that carries this label (its fill is on an inner view). */
const fillsOf = (label: string) => fills(screen.getByLabelText(label) as unknown as Node);

jest.setTimeout(30_000);

describe("the danger interrupt (ADR 0525)", () => {
  beforeEach(() => mockPush.mockClear());

  it("its first step hides the header Help, and its own red Help opens /help", async () => {
    await render(
      <ThemeProvider>
        <DangerScreen />
      </ThemeProvider>,
    );
    expect(screen.queryByLabelText(HEADER_HELP)).toBeNull();
    // Forced light (law L11), so the red is the light palette's.
    expect(fillsOf("Yes, get help now")).toContain(tideLight.emergency);
    await fireEvent.press(screen.getByLabelText("Yes, get help now"));
    expect(mockPush).toHaveBeenCalledWith("/help");
  });

  it("on the recheck the red Help is a second button, so the header Help comes back", async () => {
    await render(
      <ThemeProvider>
        <DangerScreen />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByLabelText("No, none of these"));
    expect(screen.getByLabelText(HEADER_HELP)).toBeTruthy();
  });
});

describe("the Care mode danger flow (ADR 0525)", () => {
  beforeEach(() => mockPush.mockClear());

  it("only the Help steps count as Help on the page", () => {
    expect(helpInPageFor({ flow: "other", step: "help_now" })).toBe(true);
    expect(helpInPageFor({ flow: "low_sugar", step: "help" })).toBe(true);
    expect(helpInPageFor({ flow: "very_high_bp", step: "rest" })).toBe(false);
    expect(helpInPageFor({ flow: "low_sugar", step: "sweet" })).toBe(false);
    expect(helpInPageFor({ flow: "very_high_bp", step: "better" })).toBe(false);
  });

  it("a Help step draws the red Get help now, and it opens Help", async () => {
    const onHelp = jest.fn();
    await render(
      <ThemeProvider>
        <DangerFlowV2
          step={{ flow: "other", step: "help_now" }}
          now={new Date()}
          onNext={jest.fn()}
          onReading={jest.fn()}
          onWarningSign={jest.fn()}
          onHelp={onHelp}
          onDone={jest.fn()}
          teamNote={null}
        />
      </ThemeProvider>,
    );
    expect(fillsOf("Get help now")).toContain(tideLight.emergency);
    await fireEvent.press(screen.getByLabelText("Get help now"));
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it("the flow tells the screen, and its Help goes to /help", async () => {
    const told = jest.fn();
    expect(startFlow("high_sugar")).toEqual({ flow: "other", step: "help_now" });
    await render(
      <ThemeProvider>
        <DangerFlowBody kind="high_sugar" onHelpInPage={told} />
      </ThemeProvider>,
    );
    expect(told).toHaveBeenLastCalledWith(true);
    await fireEvent.press(screen.getByLabelText("Get help now"));
    expect(mockPush).toHaveBeenCalledWith("/help");
  });

  it("a step that is not Help leaves the header Help where it is", async () => {
    const told = jest.fn();
    await render(
      <ThemeProvider>
        <DangerFlowBody kind="very_high_bp" onHelpInPage={told} />
      </ThemeProvider>,
    );
    expect(told).toHaveBeenLastCalledWith(false);
  });
});
