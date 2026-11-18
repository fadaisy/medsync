import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Patient app v2 is the phone's default (ADR 0524, 18 Nov 2026): there is no `appV2Mobile` switch any more.
 * Care mode did not move with it: `careMode` and `mobileClinicalData` stay locked in code until Gate CG is
 * signed, whatever a build's environment says.
 */
const SRC = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function flagsWith(env: string) {
  const was = process.env.EXPO_PUBLIC_MOBILE_FLAGS;
  process.env.EXPO_PUBLIC_MOBILE_FLAGS = env;
  let mod!: typeof import("@/lib/flags");
  jest.isolateModules(() => {
    mod = jest.requireActual("@/lib/flags");
  });
  process.env.EXPO_PUBLIC_MOBILE_FLAGS = was;
  return mod;
}

describe("phone flags after the v2 cutover", () => {
  it("Gate CG is not signed", () => {
    expect(flagsWith("").GATE_CG_SIGNED).toBe(false);
  });

  it("the environment cannot unlock Care mode or clinical data", () => {
    const { flag } = flagsWith("careMode,mobileClinicalData,appV2Mobile,mobilePayments");
    expect(flag("careMode")).toBe(false);
    expect(flag("mobileClinicalData")).toBe(false);
  });

  it("payments stay a switch of their own, off unless a build turns them on", () => {
    expect(flagsWith("").flag("mobilePayments")).toBe(false);
    expect(flagsWith("appV2Mobile").flag("mobilePayments")).toBe(false);
  });

  it("no screen reads an appV2Mobile switch: v2 is the path taken", () => {
    const readers = files(SRC).filter((p) => readFileSync(p, "utf8").includes("appV2Mobile"));
    expect(readers).toEqual([]);
  });

  it("every Care mode screen still checks careMode", () => {
    const gated = [
      "app/(app)/(tabs)/care.tsx",
      "app/(app)/care/plan.tsx",
      "app/(app)/care/my-care.tsx",
      "app/(app)/care/messages.tsx",
      "app/(app)/care/medicines.tsx",
      "app/(app)/danger.tsx",
    ];
    for (const f of gated) expect(readFileSync(join(SRC, f), "utf8")).toMatch(/flag\("careMode"\)/);
  });
});
