import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate H (ADR 0094) — DESIGN-medsync.md's two colour anti-patterns, held by
 * grep rather than by review: "red for non-critical UI — red = clinical
 * emergency ONLY" and "colour alone to convey status". Source-level like the
 * other gate suites: a rule about which classes a file may NAME needs no DOM.
 *
 * Trees: the patient and booking surfaces on the web and in the Expo app, the
 * shared responsive chrome, and lib/patient + lib/reception, which hold the
 * status → tone maps the Pills read. NOT the clinician surfaces — resus and
 * triage are where red is supposed to be, and DESIGN-medsync.md § ABCDE
 * governs them separately.
 *
 * What counts as red, taken from app/globals.css `@theme` and
 * mobile/src/theme/tokens.ts rather than guessed:
 *   web     status-critical-{bg,fg}, destructive(-foreground),
 *           alert-{bg,border,fg}, Tailwind's own red-* / rose-*, the hexes
 *   mobile  status.criticalBg / criticalFg, tone="critical", the same hexes
 *
 * Limits of the heuristic, so nobody over-trusts it:
 *   - It reads class strings and JSX props. A colour computed at runtime
 *     (`bg-${tone}`) or an inline `style` is invisible to it — and is also
 *     banned by the design system, for the same reason it is invisible here.
 *   - "Visible text" means non-blank JSX children. `{label}` passes; whether
 *     `label` can be the empty string is that component's contract.
 *   - The opening-tag scanner tracks `{}` depth, so an arrow function in a prop
 *     is fine, but a `>` inside a plain string prop would end the tag early.
 *   - Comments are stripped first, so a file may still say why it does NOT
 *     use red (several do).
 */
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const tree = (...dirs: string[]) =>
  dirs
    .flatMap((d) => walk(resolve(ROOT, d)))
    .map((p) => [relative(ROOT, p), stripComments(readFileSync(p, "utf8"))] as const);

const WEB = tree(
  "app/patient",
  "app/reception",
  "components/responsive",
  "lib/patient",
  "lib/reception",
);
const MOBILE = tree("mobile/src");

/**
 * The JSX opening tag that contains `index`: from the nearest `<` that opens a
 * tag, forward to its `>` at brace depth zero. Returns the tag's text, its
 * name, whether it self-closes, and the children up to the matching close tag.
 */
function elementAt(src: string, index: number) {
  let start = index;
  while (start > 0 && !(src[start] === "<" && /[A-Za-z]/.test(src[start + 1] ?? ""))) start--;
  let depth = 0;
  let end = start;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) break;
  }
  const tag = src.slice(start, end + 1);
  const name = /^<([A-Za-z][\w.]*)/.exec(tag)?.[1] ?? "";
  const selfClosing = tag.endsWith("/>");
  const close = selfClosing ? -1 : src.indexOf(`</${name}>`, end);
  const children = selfClosing || close < 0 ? "" : src.slice(end + 1, close);
  return { tag, name, selfClosing, children: children.trim() };
}
const each = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m.index as number);

// ─── Web ──────────────────────────────────────────────────────────────────────

/**
 * A red FILL, ring, chip, button or status tone. Deliberately not matched:
 * `text-destructive` (a red word — text by construction, held to its own rule
 * below) and `bg-/border-destructive/NN` (the tint of an announced failure,
 * also below). `bg-destructive` followed by anything but `/` is the solid.
 */
const WEB_RED_FILL =
  /(?:bg|ring|border|from|to|via|outline|shadow|fill|stroke|text|decoration)-status-critical|bg-destructive(?![/\w-])|border-destructive(?![/\w-])|ring-destructive|destructive-foreground|variant=["']destructive["']|["']critical["']|\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|decoration)-(?:red|rose)-\d|(?:bg|border|text)-alert-(?:bg|border|fg)|#(?:dc2626|fee2e2|fca5a5|450a0a|7f1d1d|b91c1c|991b1b|fef2f2)\b/i;

describe("red is reserved — web patient and booking surfaces", () => {
  /**
   * Files allowed a red fill. EMPTY on purpose: the emergency block is amber by
   * decision (ADR 0084 §3, app/patient/_components/emergency-notice.tsx — "a
   * permanent red band on a patient's home screen trains the patient to
   * discount red"), the resus surface lives under app/clinician, and no
   * destructive confirmation exists on these surfaces (a cancel is
   * `variant="secondary"`). A genuine emergency surface added here goes in
   * this list WITH the ADR that sanctions it.
   */
  const RED_FILL_ALLOWED: readonly string[] = [];

  it("no file paints a red fill, ring, chip, button or `critical` tone", () => {
    for (const [path, src] of WEB) {
      if (RED_FILL_ALLOWED.includes(path)) continue;
      const m = WEB_RED_FILL.exec(src);
      expect(m, `${path}: ${m?.[0]}`).toBeNull();
    }
  });

  it('red text is an announced failure: every `text-destructive` element is role="alert" and carries words', () => {
    // The one element whose `role="alert"` is on the wrapping <section>, not on
    // the <p> that carries the colour — a decrypt failure on /patient/profile.
    const ALERT_ON_PARENT = ["app/patient/profile/page.tsx"];
    for (const [path, src] of WEB) {
      for (const i of each(src, /text-destructive/g)) {
        const el = elementAt(src, i);
        if (!ALERT_ON_PARENT.includes(path)) {
          expect(el.tag, `${path}: ${el.tag}`).toMatch(/role="alert"/);
        }
        expect(el.selfClosing, `${path}: self-closing ${el.tag}`).toBe(false);
        expect(el.children, `${path}: no words in ${el.tag}`).not.toBe("");
      }
    }
  });

  it('a red tint (`bg-/border-destructive/NN`) sits only on a role="alert" element', () => {
    for (const [path, src] of WEB) {
      for (const i of each(src, /(?:bg|border)-destructive\//g)) {
        const el = elementAt(src, i);
        expect(el.tag, `${path}: ${el.tag}`).toMatch(/role="alert"/);
        expect(el.children, `${path}: no words in ${el.tag}`).not.toBe("");
      }
    }
  });
});

describe("never colour alone — web status indicators carry a word", () => {
  it("every Pill / Badge / ClinicalBadge has visible children and is not aria-hidden", () => {
    for (const [path, src] of WEB) {
      for (const i of each(src, /<(?:Pill|Badge|ClinicalBadge)\b/g)) {
        const el = elementAt(src, i);
        expect(el.selfClosing, `${path}: self-closing ${el.tag}`).toBe(false);
        expect(el.children, `${path}: empty ${el.tag}`).not.toBe("");
        expect(el.tag, `${path}: hidden ${el.tag}`).not.toMatch(/aria-hidden/);
      }
    }
  });

  it("the status → tone maps the Pills read never resolve to `critical`", () => {
    const maps = WEB.filter(
      ([p]) => p.startsWith("lib/patient/") || p.startsWith("lib/reception/"),
    );
    expect(maps.length).toBeGreaterThan(0);
    for (const [path, src] of maps) expect(src, path).not.toMatch(/:\s*["']critical["']/);
  });
});

// ─── Mobile ───────────────────────────────────────────────────────────────────

describe("red is reserved — the Expo app", () => {
  /**
   * The only files that may name the critical pair or pass `tone="critical"`,
   * and why (ADR 0085 §5: red is the emergency affordance and nothing else):
   *   theme/tokens.ts                     defines the pair, light and dark
   *   components/ui/icon-button.tsx       draws the `critical` disc
   *   components/ui/tab-bar.tsx           draws the `critical` tab chip
   *   components/patient/emergency-button.tsx  the red disc on pushed screens
   *   app/(app)/(tabs)/_layout.tsx        the Emergency tab
   */
  const RED_ALLOWED = [
    "mobile/src/theme/tokens.ts",
    "mobile/src/components/ui/icon-button.tsx",
    "mobile/src/components/ui/tab-bar.tsx",
    "mobile/src/components/patient/emergency-button.tsx",
    "mobile/src/app/(app)/(tabs)/_layout.tsx",
  ];
  const MOBILE_RED =
    /critical(?:Bg|Fg)\b|status\.critical|tone=["']critical["']|["']critical["']|#(?:dc2626|fee2e2|fca5a5|450a0a|7f1d1d|b91c1c|991b1b)\b/i;

  it("the allowlist is real — every file in it exists and does use the pair", () => {
    for (const p of RED_ALLOWED) {
      const src = MOBILE.find(([q]) => q === p)?.[1];
      expect(src, p).toBeDefined();
      expect(src, p).toMatch(MOBILE_RED);
    }
  });

  it("no other file names the critical pair, a `critical` tone, or a red hex", () => {
    for (const [path, src] of MOBILE) {
      if (RED_ALLOWED.includes(path)) continue;
      const m = MOBILE_RED.exec(src);
      expect(m, `${path}: ${m?.[0]}`).toBeNull();
    }
  });

  it("the two primitives draw `critical` only when told to — no default, no derivation from status", () => {
    for (const p of [
      "mobile/src/components/ui/icon-button.tsx",
      "mobile/src/components/ui/tab-bar.tsx",
    ]) {
      const src = MOBILE.find(([q]) => q === p)?.[1] ?? "";
      expect(src, p).not.toMatch(/tone\s*=\s*["']critical["']/); // never a default
      expect(src, p).not.toMatch(/status\s*===?\s*["']/); // never keyed off an appointment status
    }
  });

  it("the appointment Pill has no red tone at all", () => {
    const pill = MOBILE.find(([p]) => p === "mobile/src/components/ui/pill.tsx")?.[1] ?? "";
    expect(pill).not.toMatch(/critical/);
    expect(pill).toMatch(/type Tone = "stable" \| "caution" \| "pending" \| "neutral"/);
  });
});

describe("never colour alone — the Expo app", () => {
  it('every `tone="critical"` control carries a label', () => {
    for (const [path, src] of MOBILE) {
      for (const i of each(src, /tone=["']critical["']/g)) {
        const el = elementAt(src, i);
        expect(el.tag, `${path}: ${el.tag}`).toMatch(/\blabel=["'][^"']+["']/);
      }
    }
  });

  it("every Pill is keyed by status, and every status in its map has a word", () => {
    for (const [path, src] of MOBILE) {
      if (path === "mobile/src/components/ui/pill.tsx") continue;
      for (const i of each(src, /<Pill\b/g)) {
        expect(elementAt(src, i).tag, path).toMatch(/\bstatus=\{/);
      }
    }
    const pill = MOBILE.find(([p]) => p === "mobile/src/components/ui/pill.tsx")?.[1] ?? "";
    const entries = [...pill.matchAll(/\{ tone: "(\w+)", word: "([^"]*)" \}/g)];
    expect(entries.length).toBeGreaterThanOrEqual(10); // the ten appointments.status values
    for (const [, tone, word] of entries) {
      expect((word ?? "").trim(), `tone ${tone} without a word`).not.toBe("");
    }
  });
});
