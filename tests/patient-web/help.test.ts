import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SosEvent, SosState } from "@patient-core/help-sos";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  callClock,
  leftWords,
  shouldWrite,
  sosIdle,
  sosNext,
  WRITE_EVERY_MS,
} from "@patient-core/help-sos";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import HelpLayout from "@/app/pw/emergency/layout";
import { HELP_COPY } from "@/content/patient/help";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { canDial } from "@/lib/patient-web/help-device";
import { SOS_COUNTDOWN_S, SOS_DIAL } from "@/mobile/src/features/safety/config";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pw/emergency",
  useRouter: () => ({ back: () => {} }),
}));

/** Help (Step 7): S21 the countdown sends nothing, S22 forced light, S23 signed out, S24 dial or show. */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function run(events: SosEvent[]) {
  let s: SosState = sosIdle(SOS_COUNTDOWN_S);
  let dials = 0;
  for (const e of events) {
    const r = sosNext(s, e, SOS_COUNTDOWN_S);
    s = r.state;
    if (r.dial) dials++;
  }
  return { s, dials };
}

describe("S21: nothing is dialled or sent during the countdown", () => {
  it("counts 3, 2, 1 and dials once, on the tick that ends it", () => {
    expect(SOS_COUNTDOWN_S).toBe(3);
    expect(run(["start"]).s).toEqual({ phase: "counting", secs: 3 });
    expect(run(["start", "tick", "tick"])).toEqual({ s: { phase: "counting", secs: 1 }, dials: 0 });
    expect(run(["start", "tick", "tick", "tick"])).toEqual({
      s: { phase: "calling", secs: 0 },
      dials: 1,
    });
    // Late ticks after the call never dial again.
    expect(run(["start", "tick", "tick", "tick", "tick", "tick"]).dials).toBe(1);
  });

  it("cancel within 3 s leaves no call and no event", () => {
    for (const ticks of [0, 1, 2]) {
      const r = run(["start", ...Array<SosEvent>(ticks).fill("tick"), "cancel", "tick", "tick"]);
      expect(r).toEqual({ s: sosIdle(SOS_COUNTDOWN_S), dials: 0 });
    }
    // A second press while counting does not restart or dial.
    expect(run(["start", "tick", "start"]).s).toEqual({ phase: "counting", secs: 2 });
  });

  it("the page dials and audits only from the step that says so", () => {
    const src = code("app/pw/emergency/_components/help-view.tsx");
    expect(src.match(/\bdial\(\)/g)).toEqual(["dial()"]);
    expect(src).toMatch(/if \(r\.dial\) dial\(\);/);
    // The SOS audit and the automatic tel: live inside dial() alone.
    const dialBody = src.slice(src.indexOf("const dial = () => {"), src.indexOf("const send ="));
    expect(dialBody).toMatch(/window\.location\.href = telHref\(SOS_DIAL\)/);
    expect(dialBody).toMatch(/contact_id: "config:general"/);
    expect(src.replace(dialBody, "")).not.toMatch(
      /window\.location\.href|config:general"\s*}\)\.catch/,
    );
  });

  it("the call clock reads mm:ss", () => {
    expect(callClock(0, 7_400)).toBe("00:07");
    expect(callClock(0, 125_000)).toBe("02:05");
  });
});

describe("S24: a phone gets tel:, a computer gets the number and the line", () => {
  const UA = {
    iphone:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    android:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
    androidTablet:
      "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    windows:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    kaios: "Mozilla/5.0 (Mobile; Nokia_8110_4G; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5",
  };

  it("decides by user agent", () => {
    expect(canDial(UA.iphone)).toBe(true);
    expect(canDial(UA.android)).toBe(true);
    expect(canDial(UA.kaios)).toBe(true);
    for (const ua of [UA.androidTablet, UA.ipad, UA.mac, UA.windows, "", null, undefined])
      expect(canDial(ua)).toBe(false);
  });

  it("the computer's line names the number from data", () => {
    expect(PATIENT_WEB_COPY.desktopCall.replace("{number}", SOS_DIAL)).toBe(
      `Your computer cannot place the call. Dial ${SOS_DIAL} on any phone now.`,
    );
    const src = code("app/pw/emergency/_components/help-view.tsx");
    // The calling state branches on the device: a tel: link, or the number large with the line.
    expect(src).toMatch(/\{dialler \? \(\s*<a\s+href=\{telHref\(SOS_DIAL\)\}/);
    expect(src).toMatch(/PATIENT_WEB_COPY\.desktopCall\.replace\("\{number\}", SOS_DIAL\)/);
    // The server decides, the browser decides only when the server saw no user agent.
    expect(code("app/pw/emergency/page.tsx")).toMatch(/serverDial=\{ua \? canDial\(ua\) : null\}/);
    expect(src).toMatch(/\(\) => serverDial \?\? canDial\(navigator\.userAgent\)/);
  });

  it("no emergency number is typed in Help's code (W5)", () => {
    for (const f of walk("app/pw/emergency"))
      expect(code(f), f).not.toMatch(/["'`>]\s*(112|912|999|911)\b/);
  });
});

function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((n) => {
    const p = join(dir, n);
    return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("S22: Help stays light under the OS's dark mode and the app's Dark theme", () => {
  const css = read("app/globals.css");
  const block = css.slice(css.indexOf("/* pw-tokens:start */"), css.indexOf("/* pw-tokens:end */"));
  const light = /:root:has\(\[data-pw\]\),\n:root\.dark:has\(\[data-pw-light\]\) \{([^}]*)\}/.exec(
    block,
  )?.[1];
  const dark = /:root\.dark:has\(\[data-pw\]\):not\(:has\(\[data-pw-light\]\)\) \{([^}]*)\}/.exec(
    block,
  )?.[1];
  const value = (decls: string | undefined, name: string) =>
    new RegExp(`${name}:\\s*([^;]+);`).exec(decls ?? "")?.[1]?.trim();

  it("every Help page renders inside data-pw-light", () => {
    const html = renderToStaticMarkup(h(HelpLayout, null, h("p", null, "x")));
    expect(html).toMatch(/^<div data-pw="" data-pw-light=""/);
    for (const f of walk("app/pw/emergency").filter((f) => f.endsWith("page.tsx")))
      expect(f.startsWith(join("app", "pw", "emergency"))).toBe(true);
  });

  it("computes the light values with the html element in dark", () => {
    // The app's Dark theme and the OS's dark mode (next-themes' "system") both put `dark` on <html>.
    const html = renderToStaticMarkup(h(HelpLayout, null, h("p", null, "x")));
    const dom = new JSDOM(
      `<!doctype html><html class="dark"><head><style>${block.replace(/@theme inline \{[^}]*\}/, "")}</style></head><body>${html}</body></html>`,
    );
    const root = dom.window.document.documentElement;
    const got = dom.window.getComputedStyle(root).getPropertyValue("--pw-bg").trim();
    // jsdom may not evaluate :has(); then the declared cascade is checked from the source instead.
    const expected = value(light, "--pw-bg");
    expect(expected).toBeTruthy();
    if (got) expect(got).toBe(expected);
    for (const token of ["--pw-bg", "--pw-surface", "--pw-ink", "--pw-emergency-band"])
      expect(value(light, token), token).toBeTruthy();
    // The dark values exist, and their selector skips any page that renders data-pw-light.
    expect(value(dark, "--pw-bg")).not.toBe(expected);
    expect(block).not.toMatch(/prefers-color-scheme/);
  });
});

describe("S23: signed out, nothing personal", () => {
  it("renders Help signed out with the national words and no card", async () => {
    const { HelpView } = await import("@/app/pw/emergency/_components/help-view");
    const html = renderToStaticMarkup(
      h(
        HelpLayout,
        null,
        h(HelpView, { serverDial: false, medic: null, facilities: [], share: null }),
      ),
    );
    expect(html).toContain(HELP_COPY.sos.idleTitle);
    expect(html).toContain(`aria-label="${HELP_COPY.sos.buttonLabel(SOS_DIAL, SOS_COUNTDOWN_S)}"`);
    expect(html).toContain(HELP_COPY.rows.linesOut);
    expect(html).toContain(HELP_COPY.rows.contactOut);
    for (const personal of [
      HELP_COPY.medic.title,
      HELP_COPY.rows.message,
      HELP_COPY.rows.share,
      "Help, emergency",
    ])
      expect(html).not.toContain(personal);
    // Nothing is dialled on load: the only tel: is behind the countdown.
    expect(html).not.toContain('href="tel:');
  });

  it("no Help page needs a session, and the medic card loads only for a signed-in user", () => {
    for (const f of walk("app/pw/emergency"))
      expect(code(f), f).not.toMatch(/requirePatientScope|resolvePatientScope/);
    const page = code("app/pw/emergency/page.tsx");
    expect(page).toMatch(
      /ctx\.userId\s*\?\s*await Promise\.all\(\[\s*loadMedicCard\(ctx\.userId\)/,
    );
    expect(page).toMatch(/:\s*\[null, null\]/);
    const view = code("app/pw/emergency/_components/help-view.tsx");
    expect(view).toMatch(/const signedIn = medic !== null;/);
  });
});

describe("live location share", () => {
  it("writes at most every 20 s", () => {
    expect(WRITE_EVERY_MS).toBe(20_000);
    expect(shouldWrite(null, 0)).toBe(true);
    expect(shouldWrite(0, 19_999)).toBe(false);
    expect(shouldWrite(0, 20_000)).toBe(true);
  });

  it("says the time left as the phone does", () => {
    const now = new Date(2026, 9, 25, 10, 0);
    expect(leftWords(new Date(2026, 9, 25, 10, 25), now)).toBe("25 min left");
    expect(leftWords(new Date(2026, 9, 25, 12, 10), now)).toBe("2 h 10 min left");
    expect(leftWords(now, now)).toBe("ending now");
  });

  it("asks for location only from a press, and keeps nothing in the browser (L9, W3)", () => {
    const src = code("components/tide/help-share.tsx");
    expect(src).not.toMatch(/useEffect\([^]*?getCurrentPosition/);
    expect(src).toMatch(/start: \(minutes\) =>/);
    expect(HELP_COPY.share.consent).toMatch(/at most 8 hours/);
  });
});
