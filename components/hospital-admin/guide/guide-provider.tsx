"use client";

/**
 * The new-admin guide (ADR 0522), mounted once in the hospital-admin shell so it spans the admin frame and the
 * Clinics & schedule desk. It owns the welcome, the walkthroughs (which one, which step, the spotlight), the guide
 * dialog and the motion demos.
 *
 * A walkthrough step goes to its real route with the Next router, waits for the page, finds its target by
 * `data-tour`, scrolls it into view and measures it; the maths is in lib/hospital-admin/guide. A demo does the same
 * and only points: it never presses, types into or submits anything, and calls no server action, so a demo cannot
 * change data.
 */
import type { Demo, DemoKey, Walk, WalkKey } from "@/content/hospital-admin/guide";
import type { Spot } from "@/lib/hospital-admin/guide/placement";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import desk from "@/components/reception/desk.module.css";
import { DEMO_OF, DEMOS, GUIDE, WALKS } from "@/content/hospital-admin/guide";
import { fill } from "@/content/lab-workspace-v2";
import { cursorPoint, spotFor } from "@/lib/hospital-admin/guide/placement";
import {
  fillPick,
  GUIDE_NAV_EVENT,
  pickLists,
  pickPage,
  sameRoute,
} from "@/lib/hospital-admin/guide/route";
import { GuideDialog } from "./guide-dialog";
import g from "./guide.module.css";
import { DemoOverlay, TourOverlay } from "./overlays";
import { readMemo, subscribeMemo, writeMemo } from "./storage";

export interface GuideApi {
  openGuide: () => void;
  startWalk: (k: WalkKey) => void;
  startDemo: (k: DemoKey) => void;
  setupHidden: boolean;
  setSetupHidden: (hidden: boolean) => void;
  profileVisited: boolean;
}

const Ctx = createContext<GuideApi | null>(null);

/** The guide, or null outside the admin shell (the styleguide's fixture desk has none). */
export const useGuide = () => useContext(Ctx);

export const walkOf = (k: WalkKey): Walk => WALKS.find((w) => w.key === k) ?? WALKS[0]!;
export const demoOf = (k: DemoKey): Demo => DEMOS.find((d) => d.key === k) ?? DEMOS[0]!;

const PROFILE = "/hospital-admin/profile";
const noop = () => () => {};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  try {
    const m = window.matchMedia(reducedQuery);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  } catch {
    return () => {};
  }
};
const readReduced = () => {
  try {
    return window.matchMedia(reducedQuery).matches;
  } catch {
    return false;
  }
};

/** The first visible element with this tour key, or null. */
function findTarget(key: string): HTMLElement | null {
  let list: NodeListOf<HTMLElement>;
  try {
    list = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(key)}"]`);
  } catch {
    return null;
  }
  for (const el of list) {
    if (!(el.offsetWidth > 0 || el.offsetHeight > 0)) continue;
    // The phone's closed menu is there but hidden (visibility, opacity): it gets no spotlight.
    const shown =
      typeof el.checkVisibility === "function"
        ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        : getComputedStyle(el).visibility !== "hidden";
    if (shown) return el;
  }
  return null;
}

/** The id of the first record of the first list that has one (`data-guide-list` / `data-guide-id`). */
function findPick(lists: readonly string[]): string | null {
  for (const l of lists) {
    try {
      const el = document.querySelector<HTMLElement>(`[data-guide-list~="${CSS.escape(l)}"]`);
      const id = el?.dataset.guideId;
      if (id) return id;
    } catch {
      /* no match */
    }
  }
  return null;
}

const here = () => ({ pathname: window.location.pathname, search: window.location.search });

export interface TourState {
  walk: WalkKey;
  step: number;
}
export interface DemoState {
  key: DemoKey;
  i: number;
  paused: boolean;
  done: boolean;
}
export interface Cursor {
  x: number;
  y: number;
  click: boolean;
}

export function GuideProvider({ userKey, children }: { userKey: string; children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const reduced = useSyncExternalStore(subscribeReduced, readReduced, () => false);

  const welcomed = useSyncExternalStore(
    subscribeMemo,
    () => readMemo(userKey, "welcomed"),
    () => null,
  );
  const setupHidden =
    useSyncExternalStore(
      subscribeMemo,
      () => readMemo(userKey, "setupHidden"),
      () => null,
    ) === true;
  const profileVisited =
    useSyncExternalStore(
      subscribeMemo,
      () => readMemo(userKey, "profileVisited"),
      () => null,
    ) === true;
  // The browser is known only on the client: until then nothing is shown.
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  const [tour, setTour] = useState<TourState | null>(null);
  const [welcomeGone, setWelcomeGone] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [demoMid, setDemoMid] = useState(false);
  const [toast, setToast] = useState("");

  /** Each new step, demo step or close bumps this; an older run sees it changed and stops. */
  const run = useRef(0);
  const picks = useRef(new Map<string, string | null>());
  const target = useRef<HTMLElement | null>(null);
  const demoFrom = useRef<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const walkNow = useRef<WalkKey | null>(null);

  // "Check the hospital profile" is done once the admin has opened the profile (no record stands behind it).
  useEffect(() => {
    if (path === PROFILE || path.startsWith(`${PROFILE}/`))
      writeMemo(userKey, "profileVisited", true);
  }, [path, userKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const say = useCallback((t: string) => setToast(t), []);

  /* ─── going places ─── */

  /** Polls until `ok()` or the time is up, unless a newer run started. */
  const waitFor = useCallback(async (ok: () => boolean, ms: number, token: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (run.current !== token) return false;
      if (ok()) return true;
      await sleep(80);
    }
    return run.current === token && ok();
  }, []);

  const push = useCallback(
    (href: string) => {
      if (!sameRoute(href, here())) router.push(href, { scroll: false });
      try {
        window.dispatchEvent(new CustomEvent(GUIDE_NAV_EVENT, { detail: href }));
      } catch {
        /* no window events */
      }
    },
    [router],
  );

  /** Opens a route (read-only navigation), resolving a `{pick:list}` from the list's page first. */
  const goTo = useCallback(
    async (route: string, token: number) => {
      let href = route;
      const lists = pickLists(route);
      if (lists) {
        const key = lists.join("|");
        if (!picks.current.has(key)) {
          const page = pickPage(route);
          push(page);
          await waitFor(() => sameRoute(page, here()), 8000, token);
          await waitFor(() => findPick(lists) !== null, 1500, token);
          if (run.current !== token) return false;
          picks.current.set(key, findPick(lists));
        }
        href = fillPick(route, picks.current.get(key) ?? null);
      }
      push(href);
      await waitFor(() => sameRoute(href, here()), 8000, token);
      return run.current === token;
    },
    [push, waitFor],
  );

  /** Waits for a target, scrolls it into view and returns it; null when the page does not show it. */
  const reach = useCallback(
    async (key: string, token: number) => {
      await waitFor(() => findTarget(key) !== null, 1800, token);
      if (run.current !== token) return null;
      const el = findTarget(key);
      if (!el) return null;
      try {
        // A tall target (a whole panel) is shown from its top; anything else in the middle of the screen.
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.7;
        el.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest" });
      } catch {
        /* no scroll */
      }
      await sleep(140);
      return run.current === token ? el : null;
    },
    [waitFor],
  );

  const measure = useCallback((el: HTMLElement | null) => {
    if (!el || !el.isConnected) {
      setSpot(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) {
      setSpot(null);
      return;
    }
    setSpot(spotFor(r, window.innerWidth, window.innerHeight));
  }, []);

  // The spotlight follows its target when the window changes size or the page scrolls under it.
  useEffect(() => {
    if (!tour) return;
    let raf = 0;
    const again = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (target.current) measure(target.current);
      });
    };
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
    };
  }, [tour, measure]);

  /* ─── walkthroughs ─── */

  const toStep = useCallback(
    async (k: WalkKey, i: number) => {
      const w = walkOf(k);
      const st = w.steps[i];
      if (!st) return;
      const token = ++run.current;
      // Within a walkthrough the spotlight glides from the last target to the next; a new one starts dim.
      if (walkNow.current !== k) setSpot(null);
      walkNow.current = k;
      setTour({ walk: k, step: i });
      setGuideOpen(false);
      if (w.showsSetup) writeMemo(userKey, "setupHidden", false);
      if (st[1] && !(await goTo(st[1], token))) return;
      const el = await reach(st[0], token);
      if (run.current !== token) return;
      target.current = el;
      measure(el);
      // A late layout shift (fonts, data) moves the target: measure once more.
      await sleep(450);
      if (run.current === token) measure(el);
    },
    [goTo, reach, measure, userKey],
  );

  const startWalk = useCallback(
    (k: WalkKey) => {
      picks.current.clear();
      if (!returnFocus.current && document.activeElement instanceof HTMLElement)
        returnFocus.current = document.activeElement;
      setWelcomeGone(true);
      writeMemo(userKey, "welcomed", true);
      void toStep(k, 0);
    },
    [toStep, userKey],
  );

  const closeTour = useCallback(
    (message?: string) => {
      run.current++;
      target.current = null;
      walkNow.current = null;
      setTour(null);
      setSpot(null);
      setWelcomeGone(true);
      writeMemo(userKey, "welcomed", true);
      if (message) say(message);
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back?.isConnected) back.focus();
    },
    [say, userKey],
  );

  const finishWalk = useCallback(() => {
    if (!tour) return;
    const w = walkOf(tour.walk);
    closeTour(fill(GUIDE.tour.walkDone, { walk: w.title }));
    if (w.key === "menu") router.push("/hospital-admin/today");
  }, [tour, closeTour, router]);

  /* ─── demos: navigate and point, nothing else ─── */

  /** Plays a demo from step `from` to the end, unless paused, closed or replayed (a newer run). */
  const playDemo = useCallback(
    async (k: DemoKey, from: number) => {
      const d = demoOf(k);
      const token = ++run.current;
      for (let i = from; i < d.steps.length; i++) {
        const st = d.steps[i]!;
        setDemo({ key: k, i, paused: false, done: false });
        setDemoMid(st.tour === null);
        if (st.at && !(await goTo(st.at, token))) return;
        const el = st.tour ? await reach(st.tour, token) : null;
        if (run.current !== token) return;
        if (!el) {
          // A dialog that only opens by a click, or a part this hospital does not show: say it in the middle.
          setDemoMid(true);
          setCursor(null);
        } else {
          setDemoMid(false);
          const p = cursorPoint(el.getBoundingClientRect());
          setCursor({ x: p.x, y: p.y, click: false });
          await sleep(reduced ? 200 : 760);
          if (run.current !== token) return;
          // A click ring where the admin would press: shown, never performed.
          setCursor((c) => (c ? { ...c, click: true } : c));
          await sleep(400);
          setCursor((c) => (c ? { ...c, click: false } : c));
        }
        await sleep(Math.max(2200, st.cap.length * 45));
        if (run.current !== token) return;
      }
      setDemo({ key: k, i: d.steps.length - 1, paused: false, done: true });
    },
    [goTo, reach, reduced],
  );

  const startDemo = useCallback(
    (k: DemoKey) => {
      run.current++;
      walkNow.current = null;
      picks.current.clear();
      if (!demoFrom.current)
        demoFrom.current = `${window.location.pathname}${window.location.search}`;
      setTour(null);
      setSpot(null);
      setGuideOpen(false);
      setWelcomeGone(true);
      setCursor({ x: window.innerWidth / 2, y: window.innerHeight / 2, click: false });
      void playDemo(k, 0);
    },
    [playDemo],
  );

  const stopDemo = useCallback(
    (message: boolean) => {
      run.current++;
      setDemo(null);
      setCursor(null);
      setDemoMid(false);
      // Back where the admin was: the demo only moved between pages, so nothing else needs undoing.
      const from = demoFrom.current;
      demoFrom.current = null;
      if (from && !sameRoute(from, here())) router.push(from, { scroll: false });
      if (message) say(GUIDE.demo.closed);
    },
    [router, say],
  );

  /* ─── keys: Escape closes, the arrows move between steps ─── */

  const overlayOpen = !!tour || (!welcomeGone && welcomed === false);
  useEffect(() => {
    if (!overlayOpen && !demo) return;
    const onKey = (e: KeyboardEvent) => {
      if (["Tab", "Enter", " "].includes(e.key)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.stopImmediatePropagation();
      if (demo) {
        if (e.key === "Escape") {
          e.preventDefault();
          stopDemo(true);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeTour(GUIDE.tour.skipped);
      } else if (tour && e.key === "ArrowRight") {
        e.preventDefault();
        const n = walkOf(tour.walk).steps.length;
        if (tour.step + 1 < n) void toStep(tour.walk, tour.step + 1);
        else finishWalk();
      } else if (tour && e.key === "ArrowLeft") {
        e.preventDefault();
        if (tour.step > 0) void toStep(tour.walk, tour.step - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [overlayOpen, demo, tour, toStep, closeTour, finishWalk, stopDemo]);

  const setSetupHidden = useCallback(
    (hidden: boolean) => writeMemo(userKey, "setupHidden", hidden),
    [userKey],
  );

  const api = useMemo<GuideApi>(
    () => ({
      openGuide: () => setGuideOpen(true),
      startWalk,
      startDemo,
      setupHidden,
      setSetupHidden,
      profileVisited,
    }),
    [startWalk, startDemo, setupHidden, setSetupHidden, profileVisited],
  );

  const showWelcome = client && !tour && !demo && !welcomeGone && welcomed === false;

  return (
    <Ctx.Provider value={api}>
      {children}
      {client && (showWelcome || tour) ? (
        <TourOverlay
          welcome={showWelcome}
          tour={tour}
          spot={tour ? spot : null}
          reduced={reduced}
          hasDemo={!!(tour && DEMO_OF[tour.walk])}
          onStart={() => startWalk("menu")}
          onSkip={() => closeTour(GUIDE.tour.skipped)}
          onNext={() => {
            if (!tour) return;
            if (tour.step + 1 < walkOf(tour.walk).steps.length)
              void toStep(tour.walk, tour.step + 1);
            else finishWalk();
          }}
          onBack={() => tour && tour.step > 0 && void toStep(tour.walk, tour.step - 1)}
          onPick={(i) => tour && void toStep(tour.walk, i)}
          onWatch={() => {
            const d = tour && DEMO_OF[tour.walk];
            if (d) {
              closeTour();
              startDemo(d);
            }
          }}
        />
      ) : null}
      {client ? (
        <GuideDialog
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          setupHidden={setupHidden}
          onShowSetup={() => {
            setSetupHidden(false);
            setGuideOpen(false);
            router.push("/hospital-admin/today");
          }}
          onWalk={(k) => {
            setGuideOpen(false);
            startWalk(k);
          }}
          onDemo={(k) => startDemo(k)}
          onGo={(href) => {
            setGuideOpen(false);
            router.push(href);
          }}
        />
      ) : null}
      {client && demo ? (
        <DemoOverlay
          demo={demo}
          cursor={cursor}
          mid={demoMid}
          reduced={reduced}
          onPause={() => {
            run.current++;
            setDemo((d) => (d ? { ...d, paused: true } : d));
          }}
          onPlay={() => {
            const d = demoOf(demo.key);
            if (demo.i + 1 < d.steps.length) void playDemo(demo.key, demo.i + 1);
            else setDemo({ ...demo, paused: false, done: true });
          }}
          onReplay={() => {
            picks.current.clear();
            void playDemo(demo.key, 0);
          }}
          onClose={() => stopDemo(true)}
          onTry={() => {
            const w = demoOf(demo.key).walk;
            demoFrom.current = null;
            stopDemo(false);
            startWalk(w);
          }}
        />
      ) : null}
      {client ? (
        <div className={`${desk.tokens} ${g.toast}`} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
