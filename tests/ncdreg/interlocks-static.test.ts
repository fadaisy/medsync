/**
 * §10.6 interlocks 5 and 9, statically. 9: the one banner region carries the catalogue's demo text
 * (and the draft notice) whenever demo data is on; it is rendered by the NCD layout around every
 * screen and prints. 5: no code path writes an indicator value — only the snapshot module touches
 * ncd_indicator_snapshot, and only with a report computed by the engine.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { FacilityStatus } from "@/lib/ncdreg/admin";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NoticeBanner } from "@/app/ncd/_components/notice-banner";
import { DEMO_COPY } from "@/lib/ncdreg/demo/source";

const status = (o: Partial<FacilityStatus>): FacilityStatus => ({
  approved: false,
  goLive: null,
  demo: null,
  syntheticPersons: 0,
  persons: 0,
  draftDefinitions: true,
  enabled: [],
  draftCoreEnabled: [],
  ...o,
});
const demo = (s: string) => ({ status: s }) as unknown as NonNullable<FacilityStatus["demo"]>;

describe("interlock 9: the demo banner", () => {
  it("is present while demo data is on or loading, with the turn-off action for managers", () => {
    for (const s of ["on", "loading"]) {
      const html = renderToStaticMarkup(
        createElement(NoticeBanner, {
          status: status({ demo: demo(s), syntheticPersons: 26 }),
          canManageDemo: true,
        }),
      );
      expect(html).toContain(DEMO_COPY.banner);
      expect(html).toContain(DEMO_COPY.switch_off);
      expect(html).toContain("Not approved for patient data.");
    }
  });
  it("one region, lines not stacked banners; no turn-off for others; gone when off", () => {
    const html = renderToStaticMarkup(
      createElement(NoticeBanner, { status: status({ demo: demo("on") }), canManageDemo: false }),
    );
    expect(html.match(/role="note"/g)).toHaveLength(1);
    expect(html).not.toContain(DEMO_COPY.switch_off);
    expect(
      renderToStaticMarkup(
        createElement(NoticeBanner, {
          status: status({ demo: demo("off"), approved: true, draftDefinitions: false }),
          canManageDemo: true,
        }),
      ),
    ).not.toContain(DEMO_COPY.banner);
  });
  it("the layout wraps every NCD screen in the banner", () => {
    const layout = readFileSync(resolve(__dirname, "../../app/ncd/layout.tsx"), "utf8");
    expect(layout).toContain("<NoticeBanner");
  });
});

describe("interlock 5: every figure comes from the indicator engine", () => {
  const root = resolve(__dirname, "../..");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n)) files.push(p);
    }
  };
  ["lib/ncdreg", "app/ncd", "app/api/cron"].forEach((d) => walk(join(root, d)));
  it("only lib/ncdreg/indicators/snapshot.ts writes ncd_indicator_snapshot (demo removal only deletes)", () => {
    const writers = files.filter((f) =>
      /\.(insert|update)\(ncdIndicatorSnapshot\)|INSERT INTO public\.ncd_indicator_snapshot|UPDATE public\.ncd_indicator_snapshot/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(writers.map((f) => relative(root, f))).toEqual(["lib/ncdreg/indicators/snapshot.ts"]);
  });
  it("the snapshot module stores only what computeIndicators returned", () => {
    const s = readFileSync(join(root, "lib/ncdreg/indicators/snapshot.ts"), "utf8");
    expect(s).toMatch(/withoutIds\(\s*computeIndicators\(/);
  });
});
