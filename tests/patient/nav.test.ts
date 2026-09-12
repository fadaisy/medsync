import { describe, expect, it } from "vitest";

import { PATIENT_NAV } from "@/app/patient/_lib/nav";
import { activeNavHref } from "@/components/responsive/mobile-tab-bar";

/**
 * The nav matcher (PLAN §F risk 4). `MobileTabBar` and `PatientNavRail` render
 * the same array through the same function, so one assertion per route is the
 * whole guarantee that exactly one tab and exactly one rail row carry
 * `aria-current` — the two used to be separate trees that disagreed, which is
 * why seven routes were unreachable above `md:` and four lit no tab at all.
 *
 * Every entry below is a real `page.tsx` under `app/patient/`. Add a route,
 * add a line: a route that lights nothing here lights nothing in the product.
 */
const EXPECTED: Record<string, string | undefined> = {
  "/patient": "/patient",
  "/patient/track": "/patient/track",
  "/patient/track/log": "/patient/track",
  "/patient/track/medications": "/patient/track",
  // The longer href wins, so Doses does not also light its parent Track.
  "/patient/track/doses": "/patient/track/doses",
  "/patient/appointments": "/patient/appointments",
  "/patient/book": "/patient/appointments",
  "/patient/queue": "/patient/appointments",
  "/patient/queue/abc-123": "/patient/appointments",
  "/patient/menu": "/patient/menu",
  "/patient/profile": "/patient/menu",
  "/patient/hospitals": "/patient/menu",
  "/patient/settings": "/patient/menu",
  "/patient/consent": "/patient/menu",
  "/patient/care": "/patient/menu",
};

describe("patient navigation", () => {
  it("lights exactly one item on every patient route", () => {
    for (const [pathname, href] of Object.entries(EXPECTED)) {
      expect(activeNavHref(PATIENT_NAV, pathname), pathname).toBe(href);
    }
  });

  it("a sibling that merely shares a prefix lights nothing", () => {
    // Without the `=== p || startsWith(p + "/")` guard this matched Track.
    expect(activeNavHref(PATIENT_NAV, "/patient/tracking")).toBeUndefined();
  });

  it("covers every route the matcher can be asked about", () => {
    // Each nav href must itself be one of the asserted paths, or the array has
    // grown an entry no test pins down.
    for (const item of PATIENT_NAV) {
      expect(Object.keys(EXPECTED)).toContain(item.href);
    }
  });
});
