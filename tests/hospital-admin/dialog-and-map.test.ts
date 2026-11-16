import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { googleMapsUrl, parseHits } from "@/app/hospital-admin/departments/emergency/_lib/geo";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("desk dialogs keep their height", () => {
  it("maps `md` to the medium dialog only, never the desk calendar's 34px day cell", () => {
    const shared = read("components/clinics-schedule/shared.tsx");
    expect(shared).toMatch(/const CS_ONLY = new Set\(\["md"\]\)/);
    expect(shared).toContain("CS_ONLY.has(x as string) ? undefined : desk[x as string]");
    // The day cell it collided with is still drawn by the desk calendar's own helper.
    expect(read("components/reception/desk.module.css")).toMatch(
      /\n\.md \{\n\s+position: relative;\n\s+height: 34px;/,
    );
  });

  it("an input placed straight in a section's column does not collapse", () => {
    expect(read("components/clinics-schedule/cs.module.css")).toMatch(
      /\.su-sec > \.in,\n\.det > \.in \{\n\s+flex: none;/,
    );
  });

  it("no floating Emergency over the admin desk, whose top bar carries it", () => {
    expect(read("components/emergency/emergency-pill.tsx")).toContain('  "/hospital-admin",\n];');
  });
});

describe("finding the hospital on a map", () => {
  it("opens Google Maps' satellite view at the pin, no key", () => {
    expect(googleMapsUrl(0.3376, 32.57631234)).toBe(
      "https://www.google.com/maps/@?api=1&map_action=map&center=0.337600,32.576312&zoom=19&basemap=satellite",
    );
  });

  it("keeps only search rows with a usable point", () => {
    expect(
      parseHits([
        { display_name: "Mulago Hill, Kampala", lat: "0.3376", lon: "32.5763" },
        { display_name: "No point", lat: "x", lon: "32" },
        { lat: "1", lon: "2" },
      ]),
    ).toEqual([{ label: "Mulago Hill, Kampala", lat: 0.3376, lng: 32.5763 }]);
    expect(parseHits({ error: "nope" })).toEqual([]);
  });

  it("searches Uganda only, and only when asked", () => {
    const geo = read("app/hospital-admin/departments/emergency/_lib/geo.ts");
    expect(geo).toContain('u.searchParams.set("countrycodes", "ug")');
    const dialog = read("app/hospital-admin/departments/emergency/_components/pin-dialog.tsx");
    expect(dialog).toMatch(/onSubmit=\{\(ev\) => \{\s+ev\.preventDefault\(\);\s+void search\(\);/);
  });
});
