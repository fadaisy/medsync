import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CS } from "@/content/clinics-schedule/copy";
import { DEMOS, WALKS } from "@/content/hospital-admin/guide";
import { ADMIN_HOME, adminNavGroups } from "@/lib/hospital-admin/admin-nav";
import { navTour } from "@/lib/hospital-admin/guide/keys";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const SOURCES = [...walk(resolve(ROOT, "app")), ...walk(resolve(ROOT, "components"))].map((p) =>
  readFileSync(p, "utf8"),
);

/** Every `data-tour` key written in the source: `data-tour="x"`, the strings inside `data-tour={…}`, `tour="x"`. */
const KEYS = new Set<string>();
for (const src of SOURCES) {
  for (const m of src.matchAll(/data-tour="([^"]+)"/g)) KEYS.add(m[1]!);
  for (const m of src.matchAll(/data-tour=\{([^}]*)\}/g))
    for (const s of m[1]!.matchAll(/"([^"]+)"/g)) KEYS.add(s[1]!);
  for (const m of src.matchAll(/\btour="([^"]+)"/g)) KEYS.add(m[1]!);
}
// The menu's keys come from the labels (navTour), drawn by the frame, the workspace and the groups.
for (const label of Object.values(CS.views)) KEYS.add(navTour(label));
KEYS.add(navTour(ADMIN_HOME.label));
for (const tether of [true, false])
  for (const g of adminNavGroups({ tether }))
    for (const it of g.items) KEYS.add(navTour(it.label, g.label));

/** ADR 0522: every walkthrough and demo target is a real element; demos never change data. */
describe("the guide's targets", () => {
  it("are all tagged with data-tour somewhere in app/ or components/", () => {
    const wanted = [
      ...WALKS.flatMap((w) => w.steps.map((s) => s[0])),
      ...DEMOS.flatMap((d) => d.steps.map((s) => s.tour)),
    ].filter((k): k is string => !!k);
    const missing = [...new Set(wanted)].filter((k) => !KEYS.has(k));
    expect(missing).toEqual([]);
  });

  it("tag the menu in the admin frame, the Clinics & schedule rail and the shared groups", () => {
    for (const f of [
      "components/hospital-admin/admin-frame.tsx",
      "components/clinics-schedule/workspace.tsx",
      "components/hospital-admin/admin-nav-groups.tsx",
    ])
      expect(read(f), f).toContain("data-tour={navTour(");
    expect(read("components/hospital-admin/guide/guide-button.tsx")).toContain(
      'data-tour="guide-btn"',
    );
    for (const f of [
      "components/hospital-admin/admin-frame.tsx",
      "components/clinics-schedule/workspace.tsx",
    ])
      expect(read(f), f).toContain("<GuideNavButton />");
  });

  it("wrap both desks in one guide, in the hospital shell", () => {
    const shell = read("app/hospital-admin/_components/hospital-shell.tsx");
    expect(shell).toContain("<GuideProvider");
    expect(shell.indexOf("<GuideProvider")).toBeLessThan(shell.indexOf("<AdminFrame"));
  });

  it("give each record list a real id to pick, never an invented one", () => {
    for (const [f, list] of [
      ["components/clinics-schedule/clinics.tsx", "clinic"],
      ["app/hospital-admin/departments/_components/departments-desk.tsx", "dept"],
      ["app/hospital-admin/lab/_components/menu-tab.tsx", "lab-test"],
    ] as const) {
      const src = read(f);
      expect(src, f).toContain(`data-guide-list="${list}"`);
      expect(src, f).toMatch(/data-guide-id=\{[a-z.]+\}/);
    }
    expect(read("app/hospital-admin/departments/wards/_components/wards-view.tsx")).toContain(
      "data-guide-list=",
    );
  });
});

describe("demos", () => {
  const GUIDE_FILES = [
    ...walk(resolve(ROOT, "components/hospital-admin/guide")),
    ...walk(resolve(ROOT, "lib/hospital-admin/guide")),
    resolve(ROOT, "content/hospital-admin/guide.ts"),
  ];

  it("never import or call a server action", () => {
    for (const f of GUIDE_FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/"use server"/);
      expect(src, f).not.toMatch(/from\s+"[^"]*actions[^"]*"/);
      expect(src, f).not.toMatch(/\b\w+Action\s*\(/);
      expect(src, f).not.toMatch(/\bfetch\(/);
      expect(src, f).not.toMatch(/from\s+"@\/db/);
    }
  });

  it("never press, type into or submit anything on the page", () => {
    for (const f of GUIDE_FILES) {
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/\.click\(\)/);
      expect(src, f).not.toMatch(/requestSubmit|\.submit\(/);
      expect(src, f).not.toMatch(/new (Mouse|Pointer|Keyboard|Input)Event/);
      expect(src, f).not.toMatch(/\.value\s*=[^=]/);
      expect(src, f).not.toMatch(/dispatchEvent\(new (?!CustomEvent)/);
    }
  });

  it("say so in the bar, and show a click ring without clicking", () => {
    const guide = read("content/hospital-admin/guide.ts");
    expect(guide).toContain('note: "A demo: nothing is changed"');
    const prov = read("components/hospital-admin/guide/guide-provider.tsx");
    expect(prov).toContain("click: true");
    expect(prov).toContain("GUIDE_NAV_EVENT");
  });

  it("only point: a step's caption describes the action, and a dialog step has no target", () => {
    for (const d of DEMOS)
      for (const s of d.steps) {
        expect(s.cap.length, d.key).toBeGreaterThan(5);
        if (s.tour === null) expect(s.at, `${d.key}: ${s.cap}`).toBeUndefined();
      }
  });
});

describe("the welcome and the setup card's memory", () => {
  it("is kept per person in this browser, under a hash of the user id, every call wrapped", () => {
    const st = read("components/hospital-admin/guide/storage.ts");
    const calls = [...st.matchAll(/localStorage\./g)].length;
    const tries = [...st.matchAll(/try \{/g)].length;
    expect(calls).toBeGreaterThan(0);
    expect(tries).toBeGreaterThanOrEqual(2);
    expect(read("app/hospital-admin/layout.tsx")).toMatch(
      /createHash\("sha256"\)\.update\(scope\.userId\)/,
    );
  });

  it("asks on the welcome, as the prototype does", () => {
    const g = read("content/hospital-admin/guide.ts");
    expect(g).toContain('start: "Show me around"');
    expect(g).toContain('skip: "I’ll explore on my own"');
  });

  it("is a dialog with a label and a polite live region, and the keys move between steps", () => {
    const o = read("components/hospital-admin/guide/overlays.tsx");
    expect(o).toContain('role="dialog"');
    expect(o).toContain("aria-label={label}");
    expect(o).toContain('aria-live="polite"');
    const p = read("components/hospital-admin/guide/guide-provider.tsx");
    for (const key of ['"Escape"', '"ArrowRight"', '"ArrowLeft"']) expect(p).toContain(key);
  });

  it("gives the setup card's help button its label, and never a colour alone", () => {
    const c = read("components/hospital-admin/guide/setup-card.tsx");
    expect(c).toContain("aria-label={fill(S.show, { item: title })}");
    expect(read("content/hospital-admin/guide.ts")).toContain('show: "Show me how: {item}"');
    expect(c).toContain("{ok ? S.done : S.todo}");
    const css = read("components/hospital-admin/guide/guide.module.css");
    expect(css).not.toMatch(/critical|destructive|--red|status-/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
