import { afterEach, describe, expect, it, vi } from "vitest";

import { PHARMACY_NOTICE, PHARMACY_SIGNED_COPY } from "@/content/pharmacy";
import { pharmacyWorkspaceLiveFor } from "@/lib/pharmacy/feature";

/** Pharmacy Phase 0 — the PHARMACY_WORKSPACE flag (Law 14, D-PH0-17) and its production gate (CS-5). */
describe("PHARMACY_WORKSPACE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is off by default", () => {
    vi.stubEnv("PHARMACY_WORKSPACE", "");
    expect(pharmacyWorkspaceLiveFor("h1")).toBe(false);
  });

  it("'1' turns it on everywhere; a list turns it on per hospital", () => {
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    expect(pharmacyWorkspaceLiveFor("h1")).toBe(true);
    vi.stubEnv("PHARMACY_WORKSPACE", " h1 , h2 ");
    expect(pharmacyWorkspaceLiveFor("h2")).toBe(true);
    expect(pharmacyWorkspaceLiveFor("h3")).toBe(false);
  });

  it("CS-5: the shipped wording is draft, so production refuses it; other environments allow it", () => {
    expect(PHARMACY_SIGNED_COPY.some((c) => c.status === "draft")).toBe(true);
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(pharmacyWorkspaceLiveFor("h1")).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(pharmacyWorkspaceLiveFor("h1")).toBe(true);
    warn.mockRestore();
  });

  it("CS-5: production allows it only when every string is signed", () => {
    for (const c of PHARMACY_SIGNED_COPY) vi.spyOn(c, "status", "get").mockReturnValue("signed");
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(pharmacyWorkspaceLiveFor("h1")).toBe(true);
    vi.spyOn(PHARMACY_NOTICE, "status", "get").mockReturnValue("draft");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(pharmacyWorkspaceLiveFor("h1")).toBe(false);
  });
});
