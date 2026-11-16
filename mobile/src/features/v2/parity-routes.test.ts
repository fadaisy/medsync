/**
 * S10 / MR1 on the phone: every screen in the signed renames.json (tests/parity/patient-app) still exists as a
 * route until Step 12 moves it. Nothing is lost silently: a removed route fails here before it ships.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const APP = join(__dirname, "..", "..", "app");
const renames = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "..", "tests", "parity", "patient-app", "renames.json"), "utf8"),
) as { status: string; dropped: unknown[]; phone: Record<string, string> };

function routeExists(key: string): boolean {
  if (key.endsWith("/*")) return existsSync(join(APP, key.slice(0, -2))) || existsSync(join(APP, "(app)", key.slice(0, -2)));
  return [join(APP, "(app)", `${key}.tsx`), join(APP, `${key}.tsx`)].some(existsSync);
}

describe("S10 phone parity: renames.json routes are all present", () => {
  it("is signed and drops nothing", () => {
    expect(renames.status).toMatch(/^signed/);
    expect(renames.dropped).toEqual([]);
  });
  it.each(Object.keys(renames.phone))("%s", (key) => {
    expect(routeExists(key)).toBe(true);
  });
});
