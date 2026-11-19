import type { DoctorCard } from "@/data/doctors";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { doctorPreviews, Doctors, PREVIEW_COUNT } from "@/features/home/doctors";
import { ThemeProvider } from "@/theme/theme";

const mockState = { status: "ready", doctors: [] as DoctorCard[] };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: () => undefined,
}));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/lib/use-now", () => ({ useNow: () => new Date("2026-11-18T09:00:00+03:00") }));
jest.mock("@/data/doctors", () => ({
  ...jest.requireActual("@/data/doctors"),
  loadDoctors: jest.fn(),
  useDoctors: () => mockState,
}));

/** A doctor with one place; invented, belongs to nobody. */
const doc = (key: string, next: string | null, home = false): DoctorCard => ({
  key,
  userId: key,
  name: `Doctor ${key}`,
  role: "Medical Officer",
  initials: "DR",
  photoUrl: null,
  nextDayKey: next,
  rating: null,
  places: [
    {
      hospitalId: home ? "h-home" : "h-away",
      hospitalName: home ? "Home Hospital" : "Away Hospital",
      departmentId: "dep",
      departmentName: "General OPD",
      nextDayKey: next,
      feeWords: "No fee",
      walkInToday: false,
      home,
    },
  ],
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <Doctors />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

describe("Home's See a doctor previews", () => {
  it("soonest open day first, the patient's own hospital first on the same day, at most four", () => {
    const list = [
      doc("late", "2026-11-23"),
      doc("none", null),
      doc("away-today", "2026-11-18"),
      doc("home-today", "2026-11-18", true),
      doc("tomorrow", "2026-11-19"),
      doc("later", "2026-11-25"),
    ];
    expect(doctorPreviews(list).map((d) => d.key)).toEqual([
      "home-today",
      "away-today",
      "tomorrow",
      "late",
    ]);
    expect(doctorPreviews(list)).toHaveLength(PREVIEW_COUNT);
  });

  it("draws each preview with the day in the fewest words", async () => {
    mockState.status = "ready";
    mockState.doctors = [doc("a", "2026-11-18", true), doc("b", "2026-11-19")];
    await mount();
    expect(screen.getByText("See a doctor")).toBeTruthy();
    expect(screen.getByText("Today", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Thu 19 Nov", { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getByLabelText(/^Doctor a, Medical Officer\. Home Hospital\. Available today\./),
    ).toBeTruthy();
  });

  it("while loading, on failure, or with no doctor, it is one quiet row", async () => {
    mockState.status = "error";
    mockState.doctors = [];
    await mount();
    expect(screen.getByText("Couldn't load the doctors. Check your connection.")).toBeTruthy();
    expect(screen.queryByText("See all")).toBeNull();
  });
});
