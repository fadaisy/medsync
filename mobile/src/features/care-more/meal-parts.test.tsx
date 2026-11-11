import type { LogRow } from "@/data/health-log";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MealsSection } from "@/features/care-more/meal-parts";
import { ThemeProvider } from "@/theme/theme";

const mockRows: LogRow[] = [];
const mockAdd = jest.fn(async () => "sent" as const);
const mockRemove = jest.fn(async () => "sent" as const);
const mockSaveProduct = jest.fn(async (draft: object) => ({
  result: "sent" as const,
  product: { ...draft, id: "p1" },
}));
jest.mock("@/data/products", () => ({
  ...jest.requireActual("@/data/products"),
  useProducts: () => [],
  saveProduct: (d: object) => mockSaveProduct(d),
}));
jest.mock("@/data/health-log", () => ({
  ...jest.requireActual("@/data/health-log"),
  useHealthLog: () => ({ rows: mockRows, loading: false, error: false, retry: () => {} }),
  addLog: (...a: unknown[]) => mockAdd(...(a as [])),
  removeLog: (...a: unknown[]) => mockRemove(...(a as [])),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const NOW = new Date(2026, 9, 18, 13, 0);
const toast = jest.fn();

const show = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <MealsSection now={NOW} onToast={toast} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

describe("meals section", () => {
  beforeEach(() => {
    mockRows.length = 0;
    jest.clearAllMocks();
  });

  it("finds a food, takes a portion and saves it to lunch", async () => {
    await show();
    expect(screen.getByText(/Nothing logged today/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Add food"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("Search: matooke, beans, chai…"),
      "posho",
    );
    await fireEvent.press(screen.getByLabelText("Posho (refined maize flour)"));
    expect(screen.getByText("GI 74, high · glycemic load 30.3")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    expect(mockAdd).toHaveBeenCalledWith({
      kind: "meal",
      v1: 150,
      v2: 222,
      unit: "posho",
      note: "lunch",
    });
  });

  it("takes a packaged food typed from its label and logs it with the meal", async () => {
    await show();
    await fireEvent.press(screen.getByText("Add food"));
    await fireEvent.press(screen.getByText("Type a packaged food"));
    await fireEvent.changeText(screen.getByLabelText("Name"), "Mango juice");
    await fireEvent.changeText(screen.getByLabelText("Energy (kcal per 100 g)"), "50");
    await fireEvent.changeText(screen.getByLabelText("Carbohydrate (g per 100 g)"), "12");
    await fireEvent.changeText(screen.getByLabelText("One serving (g)"), "300");
    await fireEvent.press(screen.getByText("Continue"));
    expect(screen.getByText("GI not known · glycemic load not known")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    expect(mockSaveProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mango juice", kcal: 50, carbsG: 12, source: "typed" }),
    );
    expect(mockAdd).toHaveBeenCalledWith({
      kind: "meal",
      v1: 300,
      v2: 150,
      unit: "product:p1",
      note: "lunch",
    });
  });

  it("lists the day with totals and takes a meal back", async () => {
    mockRows.push({
      id: "m1",
      kind: "meal",
      recordedAt: new Date(2026, 9, 18, 12, 30).toISOString(),
      v1: 150,
      v2: 222,
      unit: "posho",
      note: "lunch",
    });
    await show();
    expect(screen.getByText("Lunch")).toBeTruthy();
    expect(screen.getByText("1 fist-sized lump · 222 kcal · 41 g carbs")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Remove Posho (refined maize flour)"));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("m1"));
  });
});
