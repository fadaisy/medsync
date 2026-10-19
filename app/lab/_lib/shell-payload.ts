import "server-only";

import type { LabShellPayload } from "../_components/v2/shell";
import type { labV2 } from "./places";
import { cookies } from "next/headers";

import { LABWS2 } from "@/content/lab-workspace-v2";
import { filterNeedsYou } from "@/lib/lab/needs-you";
import { labWorklistFor } from "@/lib/lab/page-data";
import { needsYouFor } from "./needs-you";

/**
 * The lab shell's payload (prompt 5.1): places, tabs, the counts in the rail (Bench: to result; Send-outs:
 * needing action; Set-up: signatures waiting for this user) and the Needs you count, which is the length of the
 * same list the Needs you page shows (NY-4).
 */
export async function shellPayload(
  v2: Awaited<ReturnType<typeof labV2>>,
): Promise<LabShellPayload> {
  const { scope, places, tabs } = v2;
  const [worklist, needs, jar] = await Promise.all([
    places.includes("bench") ? labWorklistFor(scope.hospitalId) : null,
    needsYouFor(v2),
    cookies(),
  ]);
  const name = scope.fullName ?? scope.userEmail;
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "·";
  const perms = scope.access.permissions;
  const S = LABWS2.search;
  const actions = [
    ...(tabs.quality.some((t) => t.key === "runs") && perms.has("lab.result.enter")
      ? [{ label: S.recordQc, href: "/lab/quality/qc/run" }]
      : []),
    ...(tabs.send_outs.some((t) => t.key === "board") &&
    (perms.has("lab.refer") || perms.has("lab.manage"))
      ? [{ label: S.sendOut, href: "/lab/send-outs?tab=board" }]
      : []),
    ...(tabs.bench.some((t) => t.key === "downtime")
      ? [{ label: S.downtime, href: "/lab/bench/downtime" }]
      : []),
  ];
  return {
    hospitalId: scope.hospitalId,
    hospitalName: scope.hospitalName,
    userName: name,
    initials,
    places,
    tabs: places.flatMap((p) => tabs[p].map((t) => ({ place: t.place, key: t.key, href: t.href }))),
    counts: {
      bench: worklist ? worklist.inputs.filter((i) => i.stage === "to_result").length : undefined,
      send_outs: filterNeedsYou(needs, "send_outs").length || undefined,
      setup: filterNeedsYou(needs, "setup").length || undefined,
    },
    needsYou: needs.length,
    actions,
    showWhere: !jar.get("lab_ws2_where_seen"),
  };
}
