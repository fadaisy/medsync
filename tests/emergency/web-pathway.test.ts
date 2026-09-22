import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The web Emergency Pathway (PRD MS-PRD-SYM-001 §8; ADR 0098 rulings 7–8,
 * 11). Source-level, like every gate suite (ruling 11: no browser
 * automation in the tooling floor): the pill's reach, the sheet's `tel:`
 * anchors, where red may appear, that no number is ever a literal in
 * source, the E2 defaults and E3's shared timeout.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const tree = (dir: string) =>
  walk(resolve(ROOT, dir)).map(
    (p) => [relative(ROOT, p), stripComments(readFileSync(p, "utf8"))] as const,
  );

const RED = new RegExp(
  [
    String.raw`status-critical`,
    String.raw`bg-destructive(?![/\w-])`,
    String.raw`variant=["'](?:emergency|alert|destructive)["']`,
    String.raw`variant:\s*["'](?:emergency|alert|destructive)["']`,
    String.raw`\b(?:bg|text|border)-(?:red|rose)-\d`,
    String.raw`#(?:dc2626|fee2e2|fca5a5|b91c1c|7f1d1d)\b`,
  ].join("|"),
  "i",
);

const EMERGENCY = tree("app/emergency");
const src = (rel: string) => EMERGENCY.find(([p]) => p === rel)?.[1] ?? "";

describe("the pill — one tap from anywhere, two to a call", () => {
  const pill = stripComments(read("components/emergency/emergency-pill.tsx"));

  it("app/layout.tsx mounts EmergencyPill inside Providers, after the children", () => {
    const layout = stripComments(read("app/layout.tsx"));
    expect(layout).toMatch(
      /import \{ EmergencyPill \} from "@\/components\/emergency\/emergency-pill"/,
    );
    const providers = /<Providers>([\s\S]*?)<\/Providers>/.exec(layout)?.[1] ?? "";
    expect(providers.indexOf("{children}")).toBeGreaterThanOrEqual(0);
    expect(providers.indexOf("<EmergencyPill />")).toBeGreaterThan(providers.indexOf("{children}"));
  });

  it("no layout under app/ re-declares <html> — the root layout is the only one, so the pill is on every route", () => {
    const layouts = walk(resolve(ROOT, "app")).filter((p) => /[\\/]layout\.tsx$/.test(p));
    expect(layouts.length).toBeGreaterThan(1);
    for (const p of layouts) {
      const rel = relative(ROOT, p);
      const body = stripComments(readFileSync(p, "utf8"));
      if (rel === "app/layout.tsx") expect(body).toMatch(/<html/);
      else expect(body, rel).not.toMatch(/<html/);
    }
  });

  it("is one Link to /emergency, carries the word with the icon, hides on /emergency/**, pulses once and motion-safe only", () => {
    expect(pill).toMatch(/href="\/emergency"/);
    expect(pill.match(/<Link\b/g)?.length).toBe(1);
    expect(pill).toMatch(/>\s*Emergency\s*<\/Link>/);
    expect(pill).toMatch(/pathname === "\/emergency" \|\| pathname\.startsWith\("\/emergency\/"\)/);
    expect(pill).toMatch(/motion-safe:animate-\[[^\]]*_1\]/);
    expect(pill).not.toMatch(/infinite/);
    expect(pill).toMatch(/min-h-12/);
    expect(pill).toMatch(/z-30/);
  });

  it("is the only file under components/emergency naming the critical pair, and the patient layout no longer renders the amber block", () => {
    const files = tree("components/emergency");
    expect(files.map(([p]) => p)).toContain("components/emergency/emergency-pill.tsx");
    for (const [p, s] of files) {
      if (p === "components/emergency/emergency-pill.tsx") expect(s).toMatch(RED);
      else expect(s, p).not.toMatch(RED);
    }
    expect(stripComments(read("app/patient/layout.tsx"))).not.toMatch(/EmergencyNotice/);
  });

  it("proxy.ts lists /emergency as public — a patient mid-emergency is never locked behind sign-in", () => {
    const proxy = read("proxy.ts");
    const block = proxy.slice(
      proxy.indexOf("const PUBLIC_PREFIXES"),
      proxy.indexOf("const PUBLIC_EXACT"),
    );
    expect(block).toMatch(/"\/emergency"/);
  });
});

describe("E1 — the sheet", () => {
  const sheet = src("app/emergency/_components/emergency-sheet.tsx");

  it("has tel: anchors (a CallLink is an <a href>), and the primary is one — pill → call is two taps", () => {
    expect(src("app/emergency/_components/call-link.tsx")).toMatch(/<a\s[\s\S]*?href=\{href\}/);
    expect(sheet.match(/href=\{telHref\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(stripComments(read("app/emergency/_lib/client.ts"))).toMatch(/`tel:\$\{/);
    const primary = sheet.slice(sheet.indexOf("{primary ? ("), sheet.indexOf(") : ("));
    expect(primary).toMatch(/<CallLink/);
    expect(primary).toMatch(/variant: "emergency"/);
  });

  it("falls back to 'Go to the nearest emergency unit' with no number when nothing is verified", () => {
    expect(sheet).toMatch(/Go to the nearest emergency unit/);
    const lib = stripComments(read("app/emergency/_lib/sheet.ts"));
    expect(lib).toMatch(/verificationStatus === "verified"/);
    expect(lib).toMatch(/primary: verified\[0\] \?\? null/);
    expect(lib).toMatch(/secondaries: verified\.slice\(1, 4\)/);
  });

  it("never names a number in source — every digit string comes from data", () => {
    for (const [p, s] of EMERGENCY) {
      expect(s, p).not.toMatch(/\b112\b|\b999\b|\b912\b/);
      expect(s, p).not.toMatch(/tel:\+?\d/);
    }
  });

  it("wraps every page in medsync-forced-light (Law 3) and reads the tier words from the catalog, never hard-coded", () => {
    const pages = EMERGENCY.filter(([p]) => /[\\/]page\.tsx$/.test(p));
    expect(pages.length).toBe(5);
    for (const [p, s] of pages) expect(s, p).toMatch(/medsync-forced-light/);
    expect(src("app/emergency/sexual-violence/page.tsx")).toMatch(/t\(CATALOG, "tier\.U"\)/);
  });

  it("logs a call tap by contact id only, fire-and-forget", () => {
    const link = src("app/emergency/_components/call-link.tsx");
    expect(link).toMatch(/event: "call_tapped", contact_id: contactId/);
    expect(link).not.toMatch(/await /);
    expect(link).not.toMatch(/preventDefault/);
  });
});

describe("red is reserved — the pathway's own allowlist", () => {
  const ALLOWED = [
    "app/emergency/_components/emergency-sheet.tsx",
    "app/emergency/tell/_components/pre-alert-form.tsx",
  ];

  it("only the sheet and E2's Send paint red; crisis, sexual-violence, status and the pages carry none", () => {
    for (const [p, s] of EMERGENCY) {
      if (ALLOWED.includes(p)) expect(s, p).toMatch(RED);
      else expect(s, p).not.toMatch(RED);
    }
    expect(src("app/emergency/crisis/page.tsx")).not.toMatch(RED);
    expect(src("app/emergency/sexual-violence/page.tsx")).not.toMatch(RED);
  });

  it("E2's only red is the Send button", () => {
    const form = src("app/emergency/tell/_components/pre-alert-form.tsx");
    const reds = form.match(/variant="emergency"/g) ?? [];
    expect(reds.length).toBe(1);
    expect(form).not.toMatch(/status-critical|bg-destructive|variant="alert"/);
  });
});

describe("E2 — defaults make Send two taps (PRD §8.3)", () => {
  const form = src("app/emergency/tell/_components/pre-alert-form.tsx");

  it("what = Not sure, when = Just now, transport = boda, arriving = 15–30 min, location sharing off", () => {
    expect(form).toMatch(/what: "Not sure"/);
    expect(form).toMatch(/onset: "now"/);
    expect(form).toMatch(/key: "now", label: "Just now"/);
    expect(form).toMatch(/transport: "boda"/);
    expect(form).toMatch(/eta: "15_30"/);
    expect(form).toMatch(/shareLocation: false/);
    expect(form).toMatch(/: signedIn\s*\?\s*"me"\s*:\s*"other"/);
  });

  it("asks for a location once, on the explicit button, and orders facilities on device", () => {
    expect(form).toMatch(/Use my location to sort hospitals/);
    expect(form).toMatch(/orderFacilities\(facilities, here, ownHospitalId\)/);
    expect(form).toMatch(/navigator\.geolocation\.getCurrentPosition/);
    expect(form).toMatch(/facility\?\.ambulanceNumber \?/);
  });

  it("keeps the call button up on call_only and rate_limited, queues offline with the SMS fallback", () => {
    expect(form).toMatch(/result\.code === "call_only" \|\| result\.code === "rate_limited"/);
    expect(form).toMatch(/navigator\.onLine === false/);
    expect(form).toMatch(/addEventListener\("online"/);
    expect(form).toMatch(/composeFacilitySms\(/);
    expect(form).toMatch(/When were they last normal\?/);
  });
});

describe("E3 — the status panel", () => {
  const panel = src("app/emergency/status/_components/status-panel.tsx");

  it("uses ACK_TIMEOUT_MS from the shared module and polls every 10 s", () => {
    expect(panel).toMatch(
      /import \{ ACK_TIMEOUT_MS \} from "@\/supabase\/functions\/_shared\/pre-arrival"/,
    );
    expect(panel).toMatch(/> ACK_TIMEOUT_MS/);
    expect(panel).toMatch(/POLL_MS = 10_000/);
    expect(panel).toMatch(/We couldn.rsquo;t confirm the hospital saw this/);
    expect(panel).toMatch(/Cancel — I.rsquo;m no longer coming/);
    expect(panel).toMatch(/We.rsquo;ve arrived/);
  });

  it("offers the SMS fallback only when the facility has the number", () => {
    expect(panel).toMatch(/smsNumber && stored\?\.smsBody \? smsLink\(/);
  });
});

describe("the server side", () => {
  it("every action goes through callEdgePublic, which works signed out", () => {
    const actions = stripComments(read("app/emergency/actions.ts"));
    expect(actions).toMatch(/^"use server";/);
    expect(actions).not.toMatch(/callEdge\(/);
    expect(actions.match(/callEdgePublic/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    const edge = stripComments(read("lib/supabase/edge.ts"));
    expect(edge).toMatch(/access_token \?\? env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("the context loader never redirects and survives the tables being absent", () => {
    const lib = stripComments(read("app/emergency/_lib/sheet.ts"));
    expect(lib).not.toMatch(/redirect\(/);
    expect(lib).toMatch(
      /catch \(e\) \{[\s\S]*?sheet = \{ contacts: own, facilities: \[\], own: null \}/,
    );
  });
});
