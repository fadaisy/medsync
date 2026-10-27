import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GATE A §3 (D-PW-09): each moved list page sends the viewer to its new home through `toV2` (a 307 while the flag
 * is on), and detail, print and form routes are never redirected.
 */
const MOVED: Record<string, string> = {
  "app/pharmacy/open-lines/page.tsx": "/pharmacy/window?view=open",
  "app/pharmacy/refills/page.tsx": "/pharmacy/window?view=refills",
  "app/pharmacy/supplied/page.tsx": "/pharmacy/window?view=supplied",
  "app/pharmacy/downtime/page.tsx": "/pharmacy/setup?view=downtime",
  "app/pharmacy/stock/page.tsx": "/pharmacy/shelf",
  "app/pharmacy/stock/national-list/page.tsx": "/pharmacy/setup?view=national",
  "app/pharmacy/controlled/page.tsx": "/pharmacy/shelf?view=controlled",
  "app/pharmacy/emergency-doses/page.tsx": "/pharmacy/shelf?view=emergency",
  "app/pharmacy/store/deliveries/page.tsx": "/pharmacy/store?tab=deliveries",
  "app/pharmacy/store/issues/page.tsx": "/pharmacy/store?tab=issues",
  "app/pharmacy/store/wards/page.tsx": "/pharmacy/store?tab=wards",
  "app/pharmacy/store/carts/page.tsx": "/pharmacy/store?tab=carts",
  "app/pharmacy/store/expiry/page.tsx": "/pharmacy/store?tab=expiry",
  "app/pharmacy/store/orders/page.tsx": "/pharmacy/store?tab=orders",
  "app/pharmacy/store/month-end/page.tsx": "/pharmacy/store?tab=monthEnd",
  "app/pharmacy/store/packs/page.tsx": "/pharmacy/setup",
  "app/pharmacy/store/places/page.tsx": "/pharmacy/setup?view=places",
  "app/pharmacy/clinical/content/page.tsx": "/pharmacy/setup?view=content",
};

const KEPT = [
  "app/pharmacy/prescriptions/[key]/page.tsx",
  "app/pharmacy/prescriptions/[key]/handover/page.tsx",
  "app/pharmacy/labels/[handoverId]/page.tsx",
  "app/pharmacy/slip/[id]/page.tsx",
  "app/pharmacy/supplied/log/page.tsx",
  "app/pharmacy/downtime/enter/[sheet]/page.tsx",
  "app/pharmacy/downtime/sheets/[from]/[to]/page.tsx",
  "app/pharmacy/stock/[medicineId]/page.tsx",
  "app/pharmacy/controlled/register/[entryId]/page.tsx",
  "app/pharmacy/store/deliveries/[id]/page.tsx",
  "app/pharmacy/store/issues/[id]/page.tsx",
  "app/pharmacy/clinical/reactions/page.tsx",
  "app/pharmacy/clinical/reconciliation/page.tsx",
  "app/pharmacy/clinical/stewardship/page.tsx",
  "app/pharmacy/clinical/interventions/page.tsx",
];

/** A route's page and, where it moved there, its body (a page file may export only page fields). */
const src = (f: string) => {
  const body = f.replace(/page\.tsx$/, "body.tsx");
  return readFileSync(f, "utf8") + (existsSync(body) ? readFileSync(body, "utf8") : "");
};

describe("Workspace v2 redirect map", () => {
  it.each(Object.entries(MOVED))("%s → %s", (file, target) => {
    expect(src(file)).toContain(`toV2("${target}"`);
  });

  it.each(KEPT)("%s is not redirected", (file) => {
    expect(src(file)).not.toContain("toV2(");
  });

  it("the landing page sends v2 viewers to their place", () => {
    expect(src("app/pharmacy/page.tsx")).toContain("landingFor(");
  });

  it("page files export only page fields (bodies live in body.tsx)", () => {
    for (const f of [...Object.keys(MOVED), ...KEPT, "app/pharmacy/page.tsx"]) {
      const names = [...readFileSync(f, "utf8").matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
      expect(names.filter((n) => !["dynamic", "metadata", "generateMetadata", "revalidate"].includes(n!)), f).toEqual([]);
    }
  });

  it("the redirect is temporary (307), never permanent, while the flag can be switched off", () => {
    const helper = src("app/pharmacy/_lib/to-v2.ts");
    expect(helper).toContain("redirect(");
    expect(helper).not.toContain("permanentRedirect");
  });
});
