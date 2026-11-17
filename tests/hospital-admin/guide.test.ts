import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEMO_OF,
  DEMOS,
  GUIDE_COPY_STATUS,
  SETUP_TASKS,
  TOPICS,
  WALKS,
} from "@/content/hospital-admin/guide";
import { navTour, slug } from "@/lib/hospital-admin/guide/keys";
import {
  arrowPath,
  cursorPoint,
  GUIDE_MOTION,
  placeText,
  spotBox,
  spotFor,
  TEXT_H,
  TEXT_W,
  textWidth,
  transitionFor,
} from "@/lib/hospital-admin/guide/placement";
import {
  atRoute,
  fillPick,
  pickLists,
  pickPage,
  routeHref,
  sameRoute,
} from "@/lib/hospital-admin/guide/route";
import { searchHowTos, searchWalks, terms } from "@/lib/hospital-admin/guide/search";
import {
  doneCount,
  NO_FACTS,
  routingIsSet,
  SETUP_KEYS,
  setupDone,
} from "@/lib/hospital-admin/guide/setup";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

/** The end point of an SVG path: its last two numbers. */
const endOf = (d: string) =>
  d
    .trim()
    .split(/[\s,MLQ]+/)
    .filter(Boolean)
    .slice(-2)
    .map(Number);
const startOf = (d: string) =>
  d
    .trim()
    .split(/[\s,MLQ]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(Number);

/** ADR 0522: the new-admin guide's pure parts. */
describe("the guide's content", () => {
  it("is a draft until the CSO signs", () => {
    expect(GUIDE_COPY_STATUS).toEqual({ status: "draft", signedBy: null, signedOn: null });
  });

  it("has the prototype's shape: 16 walkthroughs, 26 how-tos in 7 topics, 6 demos, 7 setup steps", () => {
    expect(WALKS).toHaveLength(16);
    expect(TOPICS).toHaveLength(7);
    expect(TOPICS.reduce((n, t) => n + t.items.length, 0)).toBe(26);
    expect(DEMOS.map((d) => d.key)).toEqual(["clinic", "invite", "dept", "emerg", "ward", "lab"]);
    expect(SETUP_TASKS.map((t) => t[0])).toEqual(SETUP_KEYS);
    expect(new Set(WALKS.map((w) => w.key)).size).toBe(16);
  });

  it("starts every walkthrough on a page and links only to admin routes", () => {
    for (const w of WALKS) {
      expect(w.steps.length, w.key).toBeGreaterThan(0);
      // The first step says where to go (the menu tour starts on Today).
      expect(w.steps[0]![1], w.key).not.toBeNull();
      for (const s of w.steps) if (s[1]) expect(s[1]).toMatch(/^\/hospital-admin\//);
    }
    for (const d of DEMOS) {
      expect(d.steps[0]!.at, d.key).toBeTruthy();
      for (const s of d.steps) if (s.at) expect(s.at).toMatch(/^\/hospital-admin\//);
    }
    for (const t of TOPICS)
      for (const a of t.items) {
        if (a.go) expect(routeHref(a.go)).toMatch(/^\/hospital-admin\/[a-z/-]+(\?[a-z=&-]+)?$/);
        if (a.walk) expect(WALKS.some((w) => w.key === a.walk)).toBe(true);
      }
    for (const t of SETUP_TASKS) expect(WALKS.some((w) => w.key === t[4])).toBe(true);
  });

  it("uses the query each page really reads", () => {
    const allowed: Record<string, readonly string[]> = {
      "/hospital-admin/clinics": ["view", "clinic", "tab"],
      "/hospital-admin/staff": ["tab"],
      "/hospital-admin/departments": ["view", "open"],
      "/hospital-admin/lab": ["tab", "test"],
      "/hospital-admin/requests": ["tab"],
    };
    const routes = [
      ...WALKS.flatMap((w) => w.steps.map((s) => s[1])),
      ...DEMOS.flatMap((d) => d.steps.map((s) => s.at)),
      ...TOPICS.flatMap((t) => t.items.map((a) => a.go)),
      ...SETUP_TASKS.map((t) => t[3]),
    ].filter((r): r is string => !!r);
    for (const r of routes) {
      const [path = "", q] = r.split("?");
      if (!q) continue;
      for (const [key] of new URLSearchParams(q))
        expect(allowed[path] ?? [], `${r}: ${key}`).toContain(key);
    }
    // The real values: People's tabs are review | invites | directory | admins, Departments' views unavailable | hours.
    expect(
      routes
        .filter((r) => r.includes("/staff?tab="))
        .every((r) => /tab=(invites|directory|admins)$/.test(r)),
    ).toBe(true);
  });

  it("offers a demo only where one exists, and each demo's Try it yourself is a walkthrough", () => {
    for (const k of Object.values(DEMO_OF)) expect(DEMOS.some((d) => d.key === k)).toBe(true);
    for (const d of DEMOS) expect(WALKS.some((w) => w.key === d.walk)).toBe(true);
  });

  it("never describes a deferred feature as built (ADR 0521's deferred list)", () => {
    const all = JSON.stringify({ WALKS, TOPICS, DEMOS, SETUP_TASKS });
    expect(all).not.toMatch(/Confirm it is (all )?still true/i);
    expect(all).not.toMatch(/courier/i);
    expect(all).not.toMatch(/Unpair/i);
    expect(all).not.toMatch(/Remind/);
    expect(all).not.toMatch(/sample data/i);
  });
});

describe("menu keys", () => {
  it("are nav-<slug of label>, with the hospital's People told apart from Clinics & schedule's", () => {
    expect(slug("Wards and beds")).toBe("wards-and-beds");
    expect(navTour("Get ready")).toBe("nav-get-ready");
    expect(navTour("Laboratory and imaging", "Hospital")).toBe("nav-laboratory-and-imaging");
    expect(navTour("People")).toBe("nav-people");
    expect(navTour("People", "Hospital")).toBe("nav-hospital-people");
  });
});

describe("the spotlight and the words", () => {
  const W = 1440;
  const H = 900;

  it("hugs a target in its own shape, and is round only round an icon", () => {
    const icon = spotFor({ left: 100, top: 100, width: 40, height: 40 }, W, H);
    expect(icon.round).toBe(true);
    expect(icon.w).toBe(60);
    expect(icon.h).toBe(60);
    expect(spotBox(icon).radius).toBe("50%");
    const card = spotFor({ left: 100, top: 100, width: 300, height: 120 }, W, H);
    expect(card.round).toBe(false);
    expect([card.w, card.h]).toEqual([316, 136]);
    expect(spotBox(card)).toEqual({ left: 92, top: 92, width: 316, height: 136, radius: "14px" });
    // Never wider than the screen, never taller than 70% of it.
    const huge = spotFor({ left: 0, top: 0, width: 2000, height: 2000 }, W, H);
    expect(huge.w).toBe(W - 16);
    expect(huge.h).toBe(H * 0.7);
  });

  it("puts the words right of a target with room, with an arrow to its right edge", () => {
    const sp = spotFor({ left: 20, top: 200, width: 220, height: 44 }, W, H);
    const p = placeText(sp);
    expect(p.side).toBe("right");
    expect(p.x).toBeGreaterThan(sp.x + sp.w / 2);
    expect(p.arrow).not.toBeNull();
    expect(endOf(p.arrow!.d)).toEqual([sp.x + sp.w / 2 + 10, sp.y]);
    // The head's two strokes meet on the target's edge.
    expect(p.arrow!.head).toContain(` L${sp.x + sp.w / 2 + 10} ${sp.y} L`);
  });

  it("falls back to the left, then below, then above", () => {
    const left = placeText(spotFor({ left: 1100, top: 300, width: 300, height: 60 }, W, H));
    expect(left.side).toBe("left");
    const below = placeText(spotFor({ left: 200, top: 40, width: 1040, height: 80 }, W, H));
    expect(below.side).toBe("below");
    expect(below.y).toBeGreaterThan(40 + 80);
    const above = placeText(spotFor({ left: 200, top: 700, width: 1040, height: 120 }, W, H));
    expect(above.side).toBe("above");
    expect(above.y + TEXT_H).toBeLessThan(700);
  });

  it("becomes a dark card away from the target when there is no room, with no arrow", () => {
    const big = spotFor({ left: 40, top: 150, width: 1360, height: 600 }, W, H);
    const p = placeText(big);
    expect(p.side).toBe("card");
    expect(p.arrow).toBeNull();
    // A target in the lower half puts the card at the top, and the other way round.
    expect(p.y).toBe(H - TEXT_H - 24);
    const low = placeText(spotFor({ left: 40, top: 260, width: 1360, height: 620 }, W, H));
    expect(low.side).toBe("card");
    expect(low.y).toBe(24);
  });

  it("sits in the middle with no spotlight when the target is not on the page", () => {
    expect(placeText(null)).toEqual({ side: "mid", x: 0, y: 0, arrow: null });
  });

  it("draws a quadratic curve from the words to the target's edge, bowed off the straight line", () => {
    const a = arrowPath([100, 100], [300, 100]);
    expect(a.d).toMatch(/^M100 100 Q[\d.-]+ [\d.-]+ 300 100$/);
    expect(startOf(a.d)).toEqual([100, 100]);
    const [, cy] = a.d.split("Q")[1]!.trim().split(" ").map(Number);
    expect(cy).not.toBe(100);
    expect(a.head).toMatch(/^M[\d.-]+ [\d.-]+ L300 100 L[\d.-]+ [\d.-]+$/);
  });

  it("keeps the words on a phone", () => {
    expect(textWidth(375)).toBe(343);
    expect(textWidth(1440)).toBe(TEXT_W);
    const sp = spotFor({ left: 16, top: 100, width: 343, height: 48 }, 375, 812);
    const p = placeText(sp, textWidth(375));
    expect(["below", "above", "card"]).toContain(p.side);
    expect(p.x).toBeGreaterThanOrEqual(16);
  });

  it("points the demo cursor at a label, not the middle of a wide card", () => {
    expect(cursorPoint({ left: 100, top: 100, width: 600, height: 300 })).toEqual({
      x: 160,
      y: 128,
    });
    expect(cursorPoint({ left: 100, top: 100, width: 40, height: 40 })).toEqual({ x: 120, y: 120 });
  });
});

describe("reduced motion", () => {
  it("moves on 400 ms of the system curve, and not at all when reduced motion is asked for", () => {
    expect(GUIDE_MOTION).toEqual({ ms: 400, ease: "cubic-bezier(0.16, 1, 0.3, 1)" });
    expect(transitionFor(["left", "top"], false)).toBe(
      "left 400ms cubic-bezier(0.16, 1, 0.3, 1), top 400ms cubic-bezier(0.16, 1, 0.3, 1)",
    );
    expect(transitionFor(["left", "top"], true)).toBe("none");
  });

  it("drops every transition and the click ring in CSS too", () => {
    const css = read("components/hospital-admin/guide/guide.module.css");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const cls of [".spot", ".text", ".line path", ".cur", ".prog i", ".sbar i"])
      expect(block).toContain(cls);
    expect(block).toMatch(/\.click i\s*{\s*animation: none/);
    // Only the sanctioned durations and curve.
    for (const m of css.matchAll(/(\d*\.?\d+)s\b/g))
      expect(["0.4", "0.15", ".4", ".15"]).toContain(m[1]);
    expect(css).not.toMatch(/ease-in|ease-out|linear\b|spring|bounce/);
  });

  it("is read by the overlays", () => {
    const src = read("components/hospital-admin/guide/overlays.tsx");
    expect(src).toContain("transitionFor(");
    expect(src).toMatch(/cursor\.click && !reduced/);
    expect(read("components/hospital-admin/guide/guide-provider.tsx")).toContain(
      "(prefers-reduced-motion: reduce)",
    );
  });
});

describe("search", () => {
  it("finds how-tos by every word, ignoring case and curly quotes", () => {
    const pin = searchHowTos("PIN location", TOPICS);
    expect(pin.map((h) => h.item.q)).toContain("Pin the hospital’s location");
    expect(searchHowTos("hospital's location", TOPICS).length).toBeGreaterThan(0);
    expect(searchHowTos("invite", TOPICS)[0]?.topic.key).toBe("first");
    expect(searchHowTos("zzzz", TOPICS)).toEqual([]);
    expect(searchHowTos("   ", TOPICS)).toEqual([]);
  });

  it("finds walkthroughs by their steps, and lists them all for a blank query", () => {
    expect(searchWalks("", WALKS)).toHaveLength(16);
    expect(searchWalks("palette", WALKS).map((w) => w.key)).toEqual(["wards"]);
    expect(searchWalks("publish week", WALKS).map((w) => w.key)).toContain("week");
    expect(terms("  Two   words ")).toEqual(["two", "words"]);
  });
});

describe("Set up Tether", () => {
  const all = {
    departmentLive: true,
    invitationSent: true,
    located: true,
    routing: true,
    clinicOpen: true,
    weekPublished: true,
    devicePaired: true,
  };

  it("is To do for every fact it could not read, never Done", () => {
    const d = setupDone(NO_FACTS, false);
    expect(doneCount(d)).toBe(0);
    expect(Object.values(d).every((x) => x === false)).toBe(true);
  });

  it("is Done only when the record says so", () => {
    expect(doneCount(setupDone(all, true))).toBe(7);
    expect(setupDone({ ...all, departmentLive: false }, true).depts).toBe(false);
    expect(setupDone({ ...all, weekPublished: null }, true).publish).toBe(false);
  });

  it("needs both the location and routing for the emergency step", () => {
    expect(setupDone({ ...all, located: false }, true).emerg).toBe(false);
    expect(setupDone({ ...all, routing: null }, true).emerg).toBe(false);
    expect(setupDone({ ...all, located: true, routing: true }, true).emerg).toBe(true);
  });

  it("counts the profile as checked once it was opened in this browser", () => {
    expect(setupDone(all, false).profile).toBe(false);
    expect(setupDone(all, true).profile).toBe(true);
  });

  it("counts routing as set when a value is set, verified or waiting for a second admin", () => {
    const cap = (key: string, value: unknown, extra = {}) => ({
      key,
      routing: true,
      derived: false,
      value,
      pending: null,
      verified: null,
      ...extra,
    });
    expect(routingIsSet([])).toBe(false);
    // The starting defaults say nothing.
    expect(
      routingIsSet([
        cap("emergency_capability", "none"),
        cap("accepts_pre_alerts", { enabled: false, owner: null }),
        cap("ambulance_line", null),
        cap("arrival_directions", ""),
      ]),
    ).toBe(false);
    expect(routingIsSet([cap("emergency_capability", "24h")])).toBe(true);
    expect(routingIsSet([cap("ambulance_line", "0772000000")])).toBe(true);
    expect(routingIsSet([cap("emergency_capability", "none", { pending: { at: "x" } })])).toBe(
      true,
    );
    expect(routingIsSet([cap("resus_bays", null, { verified: { at: "x" } })])).toBe(true);
    // A support value or a value counted from the wards is not routing.
    expect(routingIsSet([{ ...cap("theatre", 2), routing: false }])).toBe(false);
    expect(routingIsSet([{ ...cap("resus_bays", 2), derived: true }])).toBe(false);
  });

  it("reads each fact on the server, scoped to the hospital, and never throws", () => {
    const src = read("app/hospital-admin/today/_lib/setup.ts");
    expect(src).toMatch(/^import "server-only";/);
    expect(src).toContain("soft(");
    for (const t of [
      "hospitalDepartments.hospitalId",
      "hospitalStaffInvitations.hospitalId",
      "hospitals.id",
      "serviceLines.hospitalId",
      "scheduleVersions.hospitalId",
      "deskDevices.hospitalId",
    ])
      expect(src).toContain(`eq(${t}, hospitalId)`);
    expect(src).not.toMatch(/\.(insert|update|delete)\(/);
  });
});

describe("routes", () => {
  it("resolves a pick from the list's own page", () => {
    const r = "/hospital-admin/clinics?view=clinics&clinic={pick:clinic}&tab=basics";
    expect(pickLists(r)).toEqual(["clinic"]);
    expect(pickPage(r)).toBe("/hospital-admin/clinics?view=clinics&tab=basics");
    expect(fillPick(r, "abc")).toBe("/hospital-admin/clinics?view=clinics&clinic=abc&tab=basics");
    expect(fillPick(r, null)).toBe(pickPage(r));
    const w = "/hospital-admin/departments/wards/{pick:ward-new|ward}/layout";
    expect(pickLists(w)).toEqual(["ward-new", "ward"]);
    expect(pickPage(w)).toBe("/hospital-admin/departments/wards");
    expect(fillPick(w, "w1")).toBe("/hospital-admin/departments/wards/w1/layout");
    expect(pickLists("/hospital-admin/today")).toBeNull();
    expect(routeHref("/hospital-admin/departments?open={pick:dept}")).toBe(
      "/hospital-admin/departments",
    );
  });

  it("knows when the browser is there", () => {
    const here = { pathname: "/hospital-admin/staff", search: "?tab=invites" };
    expect(sameRoute("/hospital-admin/staff?tab=invites", here)).toBe(true);
    expect(sameRoute("/hospital-admin/staff", here)).toBe(false);
    expect(atRoute("/hospital-admin/staff", here)).toBe(true);
    expect(
      sameRoute("/hospital-admin/clinics?tab=a&view=b", {
        pathname: "/hospital-admin/clinics",
        search: "?view=b&tab=a",
      }),
    ).toBe(true);
  });
});
