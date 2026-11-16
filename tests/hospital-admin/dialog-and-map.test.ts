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

describe("Google Maps when the site has a key (ADR 0522)", () => {
  it("is optional, read from a public browser key", () => {
    const env = read("lib/env.ts");
    expect(env).toContain("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(20).optional()");
    expect(read("app/hospital-admin/departments/emergency/_lib/google-maps.ts")).toContain(
      'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""',
    );
  });

  it("falls back to OpenStreetMap without a key, or when Google refuses it or does not load", () => {
    const view = read("app/hospital-admin/departments/emergency/_components/map-view.tsx");
    expect(view).toContain(
      "if (GOOGLE_MAPS_KEY && !failed) return <GoogleMap {...props} onFail={() => setFailed(true)} />;",
    );
    expect(view).toContain("return <EntranceMap {...props} />;");
    const g = read("app/hospital-admin/departments/emergency/_components/google-map.tsx");
    expect(g).toContain("onGoogleRefused(() => latest.current.onFail())");
    expect(g).toContain(".catch(() => latest.current.onFail())");
  });

  it("searches with Google's geocoder inside Uganda, then OpenStreetMap if Google fails", () => {
    expect(read("app/hospital-admin/departments/emergency/_lib/google-maps.ts")).toContain(
      'componentRestrictions: { country: "UG" }',
    );
    expect(read("app/hospital-admin/departments/emergency/_components/pin-dialog.tsx")).toContain(
      "(GOOGLE_MAPS_KEY ? await findPlacesGoogle(q) : null) ?? (await findPlaces(q))",
    );
  });

  it("draws the pin in the action colour, never the emergency red", () => {
    const g = read("app/hospital-admin/departments/emergency/_components/google-map.tsx");
    expect(g).toContain('const PIN_FILL = "#2dd4bf";');
    expect(g).not.toMatch(/#(ef4444|dc2626|ff0000)/i);
  });
});
