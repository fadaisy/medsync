import "server-only";

import type { PharmacyShellPayload } from "../_components/v2/shell";
import type { PharmacyV2 } from "./v2";
import { cookies } from "next/headers";

import { pointIsLive } from "@/lib/pharmacy/review/load";
import { dispensingNavCountsFor } from "@/lib/pharmacy/page-data";
import { KIND_GROUP } from "@/lib/pharmacy/workspace-v2/needs-you";
import { WHERE_COOKIE } from "../_components/v2/shell";
import { PHWS2_TAB_WORDS } from "./tab-words";
import { needsYouFor } from "./needs-you";

/**
 * The shell's payload (GATE A §5): places, tabs, the rail counts (Window: waiting at the acting point; Store,
 * Clinical, Set-up: their Needs you items) and the Needs you count, the length of the same list the page shows.
 */
export async function shellPayload(v2: PharmacyV2): Promise<PharmacyShellPayload> {
  const { scope, places, tabs, points, acting } = v2;
  const [counts, needs, jar] = await Promise.all([
    places.includes("window") && v2.flags.dispensing
      ? dispensingNavCountsFor(scope.hospitalId, acting?.id ?? null)
      : null,
    needsYouFor(v2),
    cookies(),
  ]);
  const name = scope.fullName ?? scope.userEmail ?? scope.cadreName;
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "·";
  const inGroup = (g: string) => needs.filter((i) => KIND_GROUP[i.kind] === g).reduce((n, i) => n + i.n, 0) || undefined;
  return {
    hospitalName: scope.hospitalName,
    userName: name,
    initials,
    places,
    tabs,
    tabWords: PHWS2_TAB_WORDS,
    counts: {
      window: counts?.queue ?? undefined,
      store: inGroup("store"),
      clinical: inGroup("clinical"),
      setup: inGroup("setup"),
    },
    needsYou: needs.length,
    points: points.map((p) => ({ id: p.id, name: p.name, live: pointIsLive(p) })),
    pointId: acting?.id ?? null,
    showWhere: !jar.get(WHERE_COOKIE),
  };
}
