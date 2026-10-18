import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The phone's Emergency Pathway (ADR 0098 rulings 7–9, 11; PRD §8) —
 * source-level, like every other gate suite: there is no RN renderer in the
 * tooling floor, and every rule here is a fact about what a file NAMES.
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

// Tide v1 (ADR 0340) retired the Emergency tab: the red Help (law L6) opens /help, whose
// signed-in "All emergency lines" is the sheet at (app)/emergency/lines.
const E1_FILES = [
  "mobile/src/components/emergency/emergency-sheet.tsx",
  "mobile/src/app/(app)/emergency/lines.tsx",
  "mobile/src/app/emergency.tsx",
  "mobile/src/app/help.tsx",
];
const PATHWAY_FILES = [
  ...walk(resolve(ROOT, "mobile/src/components/emergency")),
  ...walk(resolve(ROOT, "mobile/src/app/(app)/emergency")),
  resolve(ROOT, "mobile/src/app/emergency.tsx"),
].map((p) => relative(ROOT, p));

const RED =
  /critical(?:Bg|Fg)\b|status\.critical|["']critical["']|#(?:fee2e2|fecaca|f87171|ef4444|dc2626|b91c1c|fca5a5|450a0a)\b/i;

describe("the pill — the red disc reaches the sheet signed out (ruling 7)", () => {
  it("the welcome and sign-in screens carry Tide's red Help, and Help is outside the sign-in gate", () => {
    for (const p of ["mobile/src/app/index.tsx", "mobile/src/app/sign-in.tsx"]) {
      const src = stripComments(read(p));
      expect(src, p).toMatch(/<Screen\b/); // <Screen> renders <HelpButton> by default
      expect(src, p).not.toMatch(/help="none"/);
    }
    const layout = stripComments(read("mobile/src/app/_layout.tsx"));
    const signedInOnly = layout.slice(
      layout.indexOf("<Stack.Protected guard={signedIn}>"),
      layout.indexOf("</Stack.Protected>", layout.indexOf("<Stack.Protected guard={signedIn}>")),
    );
    expect(layout).toMatch(/<Stack\.Screen name="help"/);
    expect(signedInOnly).not.toMatch(/name="help"/);
    // Signed out, Help's "All emergency lines" is the root sheet.
    expect(stripComments(read("mobile/src/app/help.tsx"))).toMatch(/router\.push\("\/emergency"\)/);
  });

  it("EmergencyButton opens Help by default and stays red with its label", () => {
    const src = read("mobile/src/components/patient/emergency-button.tsx");
    expect(src).toMatch(/href = "\/help"/);
    expect(src).toMatch(/tone="critical"/);
    expect(src).toMatch(/label="Emergency"/);
  });

  it("the signed-in lines screen and the root screen are the same sheet", () => {
    expect(read("mobile/src/app/(app)/emergency/lines.tsx")).toMatch(/<EmergencySheet\b/);
    expect(read("mobile/src/app/emergency.tsx")).toMatch(/<EmergencySheet\b/);
    // The pre-auth sheet never shows a draft number.
    expect(read("mobile/src/app/emergency.tsx")).toMatch(/showDrafts=\{false\}/);
  });
});

describe("E1 — the primary call is a tel: tap, and numbers come from data (ruling 8)", () => {
  const sheet = stripComments(read("mobile/src/components/emergency/emergency-sheet.tsx"));
  const lib = stripComments(read("mobile/src/lib/emergency.ts"));

  it("the primary call goes through Linking.openURL(telUrl(…))", () => {
    expect(sheet).toMatch(/Linking\.openURL\(telUrl\(/);
    expect(lib).toMatch(/`tel:\$\{/);
  });

  it("the primary is the first VERIFIED contact; with none, the no-number sentence", () => {
    expect(sheet).toMatch(/contacts\.filter\(\(c\) => !c\.draft\)/);
    expect(sheet).toMatch(/Go to the nearest emergency unit/);
  });

  it("no pathway file carries a literal emergency number", () => {
    for (const p of [...PATHWAY_FILES, "mobile/src/app/help.tsx"]) {
      expect(stripComments(read(p)), p).not.toMatch(/\b(?:112|999|912)\b/);
    }
  });

  it("call taps are audited by contact id only", () => {
    expect(sheet).toMatch(/emergencyEvent\("call_tapped", \{ contact_id: c\.id \}\)/);
  });

  it("the tiles are hidden when the catalog opened the sheet; the ONE haptic is the interrupt's, not E1's", () => {
    expect(sheet).toMatch(/from === "catalog"/);
    expect(sheet).not.toMatch(/expo-haptics|Haptics\./);
    expect(read("mobile/src/components/symptoms/emergency-interrupt.tsx")).toMatch(
      /Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Warning\)/,
    );
    expect(sheet).toMatch(/\{!fromCatalog \? \(/);
  });

  it("the sheet reads its AsyncStorage cache before the network", () => {
    expect(lib).toMatch(/"medsync:emergency-sheet"/);
    const hook = lib.slice(lib.indexOf("export function useEmergencySheet"));
    expect(hook.indexOf("readCachedSheet")).toBeGreaterThan(-1);
    expect(hook.indexOf("readCachedSheet")).toBeLessThan(hook.indexOf("fetchEmergencySheet"));
  });

  it("every screen is forced light (Law 3)", () => {
    for (const p of [
      "mobile/src/components/emergency/emergency-sheet.tsx",
      "mobile/src/components/emergency/pre-alert-form.tsx",
      "mobile/src/components/emergency/status-panel.tsx",
      "mobile/src/components/emergency/calm-screen.tsx",
    ]) {
      expect(read(p), p).toMatch(/<ForcedScheme scheme="light">/);
    }
  });
});

describe("E2 — defaults make Send two taps (PRD §8.3)", () => {
  const form = stripComments(read("mobile/src/components/emergency/pre-alert-form.tsx"));

  it("boda, 15–30 min, Just now, location sharing off, Me when signed in", () => {
    expect(form).toMatch(/useState<TransportMode>\("boda"\)/);
    expect(form).toMatch(/useState<EtaBand>\("15_30"\)/);
    expect(form).toMatch(/useState<\(typeof ONSET\)\[number\]\["key"\]>\("now"\)/);
    expect(form).toMatch(/useState<LatLng \| null>\(null\)/);
    expect(form).toMatch(/signedIn \? "me" : "adult"/);
  });

  it("the hospital defaults to the first pre-alert-enabled facility in nearest order, own first", () => {
    expect(form).toMatch(/orderFacilities\(sheet\?\.facilities \?\? \[\], here, hospitalId\)/);
    expect(form).toMatch(/enabled\[0\]\?\.facility/);
    expect(form).toMatch(/Call only/);
  });

  it("the stroke flag asks when they were last normal, as bands", () => {
    expect(form).toMatch(/flags\.has\("stroke_time"\)/);
    expect(form).toMatch(/When were they last normal\?/);
    expect(form).not.toMatch(/DateTimePicker/);
  });

  it("a refused or offline send keeps the call button and offers the SMS fallback", () => {
    expect(form).toMatch(/res\.code === "offline"/);
    expect(form).toMatch(/composeFacilitySms\(/);
    expect(form).toMatch(/smsUrl\(/);
    // The Call button is outside every error branch: it renders whenever the facility has a number.
    expect(form).toMatch(/\{facility\?\.emergencyPhone \? \(\s*<Button/);
  });

  it("the SMS body separator is platform-correct", () => {
    expect(stripComments(read("mobile/src/lib/emergency.ts"))).toMatch(
      /Platform\.OS === "ios" \? "&" : "\?"/,
    );
  });
});

describe("E3 — status (PRD §8.4)", () => {
  const panel = stripComments(read("mobile/src/components/emergency/status-panel.tsx"));

  it("uses ACK_TIMEOUT_MS from the shared engine, never its own number", () => {
    expect(panel).toMatch(/import \{ ACK_TIMEOUT_MS \} from "@shared\/pre-arrival"/);
    expect(panel).toMatch(/>= ACK_TIMEOUT_MS/);
    expect(panel).not.toMatch(/5 \* 60_000|300_000|300000/);
    expect(panel).toMatch(/We couldn&rsquo;t confirm the hospital saw this/);
  });

  it("polls while focused and cleans up", () => {
    expect(panel).toMatch(/useFocusEffect\(/);
    expect(panel).toMatch(/setInterval\(/);
    expect(panel).toMatch(/clearInterval\(timer\)/);
  });

  it("the four words, in order", () => {
    const words = [...panel.matchAll(/word: "([^"]+)"/g)].map((m) => m[1]);
    expect(words).toEqual(["Sent", "Seen by hospital", "Ready for you", "Arrived"]);
  });
});

// Ruling 9 as narrowed by the Tide v1 build prompt (law L9, owner, ADR 0340): the pre-alert asks;
// a place map asks only when the patient taps "Use my location", and a live share only when the patient starts
// one (ADR 0343); a home place is saved only with its own declinable consent. Help reads a position the patient
// already allowed and never asks in the middle of an emergency.
describe("location — asked only when the patient acts for it (ruling 9, L9; ADR 0343)", () => {
  const importers = walk(resolve(ROOT, "mobile/src"))
    .map((p) => relative(ROOT, p))
    .filter((p) => /from "expo-location"/.test(stripComments(read(p))));

  it("expo-location is imported by the pre-alert, the place map, live shares, places and Help's granted-only read", () => {
    expect([...importers].sort()).toEqual([
      "mobile/src/components/emergency/pre-alert-form.tsx",
      "mobile/src/components/tide/place-map.tsx",
      "mobile/src/data/location-share.ts",
      // A type only: the geocoder's address shape.
      "mobile/src/data/places.ts",
      "mobile/src/features/safety/location.ts",
    ]);
    expect(stripComments(read("mobile/src/data/places.ts"))).toMatch(
      /import type \{[^}]*\} from "expo-location"/,
    );
  });

  /** The body of `export async function <name>(…) {…}`, by brace depth. */
  function body(src: string, name: string): string {
    const start = src.indexOf(`export async function ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    let depth = 0;
    // The body's brace ends its line; a return type's braces do not.
    let i = src.indexOf("{\n", start);
    const from = i;
    do {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    } while (depth > 0 && i < src.length);
    return src.slice(from, i);
  }

  it("Help's read never asks; the map and the share ask only from the patient's own tap", () => {
    const granted = stripComments(read("mobile/src/features/safety/location.ts"));
    expect(granted).toMatch(/getForegroundPermissionsAsync\(\)/);
    expect(granted).not.toMatch(/request\w*PermissionsAsync/);
    for (const [file, fn] of [
      ["mobile/src/components/tide/place-map.tsx", "findMe"],
      ["mobile/src/data/location-share.ts", "startShare"],
    ] as const) {
      const src = stripComments(read(file));
      const asks = src.match(/request\w*PermissionsAsync/g) ?? [];
      expect(asks.length, `${file} asks outside ${fn}`).toBe(1);
      expect(body(src, fn), `${file}: ${fn} is where it asks`).toMatch(/request\w*PermissionsAsync/);
    }
    const steps = stripComments(read("mobile/src/features/auth/steps.tsx"));
    expect(steps).toMatch(/\{mapOpen \? \(\s*<>\s*<PlaceMap\b/);
    expect(steps).toMatch(/patch\(\{ pinConsent: !draft\.pinConsent \}\)/);
  });

  it("E1 never asks for a location", () => {
    for (const p of E1_FILES) expect(read(p), p).not.toMatch(/expo-location|Location\./);
  });

  it("the phone's orderFacilities is the web's, verbatim", () => {
    const body = (src: string) => src.slice(src.indexOf("export interface LatLng"));
    expect(body(read("mobile/src/lib/nearest.ts"))).toBe(body(read("lib/emergency/nearest.ts")));
  });
});

describe("the calm routes — no red, no haptic (PRD §5.5)", () => {
  it.each([
    "mobile/src/components/emergency/calm-screen.tsx",
    "mobile/src/app/(app)/emergency/crisis.tsx",
    "mobile/src/app/(app)/emergency/sv.tsx",
  ])("%s", (p) => {
    const src = stripComments(read(p));
    expect(src).not.toMatch(RED);
    expect(src).not.toMatch(/expo-haptics|Haptics\./);
    expect(src).not.toMatch(/TextInput/);
  });

  it("nothing in the pathway pulses", () => {
    for (const p of PATHWAY_FILES) {
      expect(stripComments(read(p)), p).not.toMatch(
        /withRepeat|Animated\.|react-native-reanimated/,
      );
    }
  });
});

describe("the transport works signed out", () => {
  it("callEdge falls back to the anon key as the Bearer and surfaces the error code", () => {
    const edge = stripComments(read("mobile/src/lib/edge.ts"));
    expect(edge).toMatch(/access_token \?\? process\.env\.EXPO_PUBLIC_SUPABASE_ANON_KEY/);
    expect(edge).toMatch(/code: "offline"/);
    expect(edge).toMatch(/status: res\.status/);
  });

  it("the device hash lives in SecureStore and the flags read EXPO_PUBLIC_FEATURE_*", () => {
    const lib = stripComments(read("mobile/src/lib/emergency.ts"));
    expect(lib).toMatch(/SecureStore\.getItemAsync\(DEVICE_KEY\)/);
    expect(lib).toMatch(/EXPO_PUBLIC_FEATURE_PRE_ALERT === "1"/);
    expect(lib).toMatch(/EXPO_PUBLIC_FEATURE_FIRST_AID_CARDS === "1"/);
  });
});
