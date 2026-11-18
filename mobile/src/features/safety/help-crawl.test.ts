import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Law L6, the Help route crawl: every route under `src/app` must show the red
 * Help. A route passes when it renders the Tide `<Screen>` (which draws Help)
 * without `help="none"`, or renders `<HelpButton>` itself. Only Help may opt
 * out, because it is the destination. Layouts and `dev/` are not routes a
 * patient reaches.
 *
 * The legacy Chroma `<Screen>` (`@/components/ui/screen`) has no Help, so a
 * legacy route counts only when it renders `<EmergencyButton />` with its
 * default target, Help. The emergency routes are Help's own family.
 */
const APP = join(__dirname, "..", "..", "app");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "dev" ? [] : routes(path);
    if (!/\.tsx?$/.test(name) || name.startsWith("_layout") || /\.test\.tsx?$/.test(name))
      return [];
    return [path];
  });
}

/** Null when the source satisfies L6, else the reason it does not. */
export function helpViolation(file: string, src: string): string | null {
  const isHelp = file === "help.tsx";
  // A header Help may be hidden only while the page itself draws a red Help that opens
  // /help (Book's "Something is wrong" card, owner 19 Oct 2026): the switch is
  // `help={helpInPage ? "none" : …}`, and the page must push "/help" from a danger button.
  const optsOut = /help=["{]["']?none/.test(src);
  if (optsOut && !isHelp) return 'opts out with help="none"; only Help may';
  const swaps = /help=\{helpInPage \? "none"/.test(src);
  // `WhyComing` draws that button itself, in its "Something is wrong" card; `WrongAreas` is that same card
  // on its own, for Book's one-question-at-a-time page (features/visits/why-coming.tsx).
  if (
    swaps &&
    !(
      (/variant="danger"/.test(src) && /push\("\/help"\)/.test(src)) ||
      /<WhyComing\b/.test(src) ||
      /<WrongAreas\b/.test(src)
    )
  )
    return "hides the header Help without a red Help of its own on the page";
  if (isHelp) return null;
  // The emergency routes are Help's own family: the lines, crisis and SV
  // screens Help opens, and the signed-out sheet.
  if (file === "emergency.tsx" || file.startsWith("(app)/emergency/")) return null;
  if (/<HelpButton\b/.test(src)) return null;
  // Patient app v2: the Book tab is Book's own screen shown under the nav (`<BookView tab />`), so its Help is
  // the one checked on `(app)/book/index.tsx`. Named here, like the emergency family; not matched loosely.
  if (file === "(app)/(tabs)/booking.tsx" && /<BookView\b/.test(src)) return null;
  // Screens not yet rebuilt in Tide: their red disc opens Help, unless sent elsewhere.
  if (/<EmergencyButton\s*\/>/.test(src)) return null;
  const tideScreen =
    /<Screen\b/.test(src) &&
    /import\s*{[^}]*\bScreen\b[^}]*}\s*from\s*"@\/components\/tide"/.test(src);
  return tideScreen ? null : "renders neither the Tide <Screen> nor <HelpButton>";
}

describe("law L6: Help is reachable on every route", () => {
  const files = routes(APP).map((p) => relative(APP, p));

  it("finds the routes", () => {
    expect(files).toContain("help.tsx");
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s shows Help", (file) => {
    expect(helpViolation(file, readFileSync(join(APP, file), "utf8"))).toBeNull();
  });

  it("the Book tab shows Book's own screen, which shows Help", () => {
    const book = readFileSync(join(APP, "(app)/book/index.tsx"), "utf8");
    expect(book).toMatch(/export function BookView\b/);
    expect(helpViolation("(app)/book/index.tsx", book)).toBeNull();
    // Only that file, and only while it renders Book's view.
    expect(
      helpViolation("(app)/(tabs)/other.tsx", "export default () => <BookView tab />;"),
    ).not.toBeNull();
    expect(helpViolation("(app)/(tabs)/booking.tsx", "export default () => null;")).not.toBeNull();
  });

  it("the card that lets a page hide its header Help draws a red Help that opens /help", () => {
    // `WrongAreas` is trusted by name above, so it is held to what that trust assumes.
    const src = readFileSync(join(APP, "..", "features", "visits", "why-coming.tsx"), "utf8");
    const card = src.slice(src.indexOf("export function WrongAreas"));
    const end = card.indexOf("\nexport function ", 1);
    expect(end === -1 ? card : card.slice(0, end)).toMatch(/<HelpNow \/>/);
    const helpNow = src.slice(src.indexOf("function HelpNow"));
    expect(helpNow).toMatch(/variant="danger"/);
    expect(helpNow).toMatch(/push\("\/help"\)/);
  });

  it("fails a route without Help", () => {
    const bare = `import { View } from "react-native";\nexport default function X() { return <View />; }`;
    expect(helpViolation("x.tsx", bare)).not.toBeNull();
    const legacy = `import { Screen } from "@/components/ui/screen";\nexport default () => <Screen />;`;
    expect(helpViolation("y.tsx", legacy)).not.toBeNull();
    const optedOut = `import { Screen } from "@/components/tide";\nexport default () => <Screen help="none" />;`;
    expect(helpViolation("danger.tsx", optedOut)).not.toBeNull();
    const swapsWithout = `import { Screen } from "@/components/tide";\nexport default () => <Screen help={helpInPage ? "none" : "round"} />;`;
    expect(helpViolation("w.tsx", swapsWithout)).not.toBeNull();
    const ok = `import { Note, Screen } from "@/components/tide";\nexport default () => <Screen />;`;
    expect(helpViolation("z.tsx", ok)).toBeNull();
  });
});
