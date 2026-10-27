import type { PharmacyV2 } from "../../_lib/v2";
import type { ReviewRow } from "@/lib/pharmacy/review/read";
import type { requirePharmacyActor } from "@/lib/pharmacy/actor";

import { EmptyState, Pill } from "@/app/lab/_components/v2/kit";
import { SecondaryLink } from "@/app/lab/_components/v2/space";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_WINDOW } from "@/content/pharmacy-workspace-v2-window";
import { CLOSE_REASONS, NOT_SUPPLIED_REASONS, REVIEW } from "@/content/pharmacy-review";
import { identitiesFor } from "@/lib/emr/read/results";
import { formatDuration } from "@/lib/lab/turnaround";
import { can } from "@/lib/pharmacy/access";
import { patientListLive } from "@/lib/pharmacy/patient-list";
import { getOpenLines } from "@/lib/pharmacy/review/read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { FilledDialog } from "../../_components/review-dialogs";
import { WorkGroup, WorkRow } from "../../_components/v2/pieces";
import { TellPatientButton } from "../../open-lines/_components/tell-patient";
import { openGroups } from "../_lib/groups";

type Scope = PharmacyV2["scope"];
type Actor = Awaited<ReturnType<typeof requirePharmacyActor>>;
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: DEFAULT_TIME_ZONE });
const rxHref = (key: string) => `/pharmacy/prescriptions/${encodeURIComponent(key)}`;
const withheld = { name: PHWS2_WINDOW.queue.nameWithheld, mrn: "", ageSex: "" };

/** Window › Ready to hand over: review rows whose stage is "ready" at the acting point, oldest first. */
export async function ReadyView({
  scope,
  rows,
  canDispense,
  serverNow,
}: {
  scope: Scope;
  rows: ReviewRow[];
  canDispense: boolean;
  serverNow: string;
}) {
  const R = PHWS2_WINDOW.ready;
  if (!rows.length) return <EmptyState title={R.empty} why={R.emptyWhy} />;
  const ids = await identitiesFor(scope, rows.map((r) => r.patientUserId), "pharmacy_queue");
  const now = new Date(serverNow).getTime();
  const sorted = [...rows].sort((a, b) => a.writtenAt.localeCompare(b.writtenAt));
  return (
    <WorkGroup title={R.title} explainer={R.explainer} count={rows.length}>
      {sorted.map((r) => {
        const who = ids.get(r.patientUserId) ?? withheld;
        const handover = `${rxHref(r.key)}/handover`;
        return (
          <WorkRow
            key={r.key}
            who={who.name}
            whoSub={who.mrn}
            what={`${r.medicines.join(", ")} · ${REVIEW.queue.lines(r.lineCount)}`}
            since={
              r.earlier
                ? fill(PHWS2_WINDOW.queue.written, { age: REVIEW.queue.age(r.ageDays) })
                : fill(PHWS2_WINDOW.queue.waiting, {
                    wait: formatDuration((now - new Date(r.writtenAt).getTime()) / 60_000),
                  })
            }
            next={R.next}
            action={canDispense ? <SecondaryLink href={handover}>{R.action}</SecondaryLink> : null}
            more={[{ label: R.open, href: rxHref(r.key) }]}
          />
        );
      })}
    </WorkGroup>
  );
}

/**
 * Window › Open lines, grouped by what can be done now (board OpenLines), from `getOpenLines` with the same
 * permissions the old page uses. Each row shows one action; every other action (change, close, print the slip) is on
 * the "Every action" view, which is the old page's own body.
 */
export async function OpenView({ scope, actor, hrefAll }: { scope: Scope; actor: Actor; hrefAll: string }) {
  const O = PHWS2_WINDOW.open;
  const { rows, points, liveSms } = await getOpenLines(scope.hospitalId, undefined, actor.pointId);
  if (!rows.length) return <EmptyState title={O.empty} why={O.emptyWhy} />;
  const ids = await identitiesFor(scope, rows.map((r) => r.patientUserId), "pharmacy_open_lines");
  const point = points.find((p) => p.id === actor.pointId) ?? null;
  const dispense = can(actor.access, "pharmacy.dispense");
  const canChange = dispense && !!point?.live;
  const canClose = dispense && !!point?.wasLive;
  const canTell = canChange && liveSms && (await patientListLive(scope.hospitalId));
  const reason = (code: string | null) =>
    code
      ? ((NOT_SUPPLIED_REASONS as Record<string, string>)[code] ??
        (CLOSE_REASONS as Record<string, string>)[code] ??
        code)
      : undefined;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-s text-muted-foreground">{O.explainer}</p>
      {openGroups(rows)
        .filter((g) => g.rows.length)
        .map((g) => (
          <WorkGroup key={g.key} title={O.groups[g.key].title} explainer={O.groups[g.key].explainer} count={g.rows.length}>
            {g.rows.map((r) => {
              const who = ids.get(r.patientUserId) ?? withheld;
              const since = fill(r.outcome === "owed" ? O.owedSince : O.outsideSince, {
                day: day.format(new Date(r.since)),
              });
              const supply =
                g.key === "shelf" && canChange && !r.controlled ? (
                  <SecondaryLink href={`${rxHref(r.key)}/handover?line=${r.lineId}`}>{O.supplyNow}</SecondaryLink>
                ) : null;
              const action =
                supply ??
                (g.key === "shelf" && canTell ? (
                  <TellPatientButton lineId={r.lineId} />
                ) : g.key === "patient" && canClose ? (
                  <FilledDialog lineId={r.lineId} medicine={r.medicine} />
                ) : null);
              const next =
                g.key === "shelf"
                  ? supply
                    ? O.nextSupply
                    : r.controlled
                      ? O.controlledHint
                      : canTell
                        ? O.nextTell
                        : O.nextOpen
                  : g.key === "patient"
                    ? O.nextRecord
                    : O.nextWait;
              return (
                <WorkRow
                  key={r.lineId}
                  who={who.name}
                  whoSub={who.mrn}
                  what={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {r.medicine}
                      {r.patientCouldNotGet ? <Pill tone="caution">{REVIEW.open.patientCouldNotGet}</Pill> : null}
                    </span>
                  }
                  since={since}
                  next={next}
                  nextSub={reason(r.reasonCode)}
                  action={action}
                  more={[
                    { label: O.openRx, href: rxHref(r.key) },
                    { label: O.allActions, href: hrefAll },
                  ]}
                />
              );
            })}
          </WorkGroup>
        ))}
    </div>
  );
}
