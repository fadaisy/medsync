import "server-only";

import type { PharmacyShellCounts, PharmacyShellPayload } from "../_components/v2/shell";
import type { PharmacyV2 } from "./v2";
import { cookies } from "next/headers";

import { pointIsLive } from "@/lib/pharmacy/review/load";
import { dispensingNavCountsFor } from "@/lib/pharmacy/page-data";
import { KIND_GROUP } from "@/lib/pharmacy/workspace-v2/needs-you";
import { WHERE_COOKIE } from "../_components/v2/shell";
import { PHWS2_TAB_WORDS } from "./tab-words";
import { needsYouFor } from "./needs-you";

/**
 * The shell's payload (GATE A §5): places, tabs, points and the viewer. Only reads already made for the page, so the
 * layout never waits on the counts; those come after the page from `shellCounts` (see `pharmacyShellCountsAction`).
 */
export async function shellPayload(v2: PharmacyV2): Promise<PharmacyShellPayload> {
  const { scope, places, tabs, points, acting } = v2;
  const jar = await cookies();
  const name = scope.fullName ?? scope.userEmail ?? scope.cadreName;
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "·";
  return {
    hospitalName: scope.hospitalName,
    userName: name,
    initials,
    places,
    tabs,
    tabWords: PHWS2_TAB_WORDS,
    points: points.map((p) => ({ id: p.id, name: p.name, live: pointIsLive(p) })),
    pointId: acting?.id ?? null,
    showWhere: !jar.get(WHERE_COOKIE),
  };
}

/**
 * The rail counts (Window: waiting at the acting point; Store, Clinical, Set-up: their Needs you items) and the
 * Needs you count, the length of the same list the page shows. Slow sources (reconciliation facts, the whole queue),
 * so the shell asks for them once the page is drawn instead of holding the page.
 */
export async function shellCounts(v2: PharmacyV2): Promise<PharmacyShellCounts> {
  const { scope, places, acting } = v2;
  const [counts, needs] = await Promise.all([
    places.includes("window") && v2.flags.dispensing
      ? dispensingNavCountsFor(scope.hospitalId, acting?.id ?? null)
      : null,
    needsYouFor(v2),
  ]);
  const inGroup = (g: string) => needs.filter((i) => KIND_GROUP[i.kind] === g).reduce((n, i) => n + i.n, 0) || undefined;
  return {
    counts: {
      window: counts?.queue ?? undefined,
      store: inGroup("store"),
      clinical: inGroup("clinical"),
      setup: inGroup("setup"),
    },
    needsYou: needs.length,
  };
}
