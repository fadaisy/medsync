import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { LAB4 } from "@/content/lab-phase-4";
import { db } from "@/db";
import { cadres, staffAffiliations, users } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { loadMatches, matchMonth } from "@/lib/lab/match-read";
import { kampalaToday } from "@/lib/lab/referral-words";
import { cn } from "@/lib/utils";
import { dateWords } from "../../_lib/days";
import { ResolveDialog } from "./_components/match-forms";

export const metadata: Metadata = { title: "Waiting for a match · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  not_found: "No open referral or specimen has this number",
  not_received: "The specimen has not been received in the lab",
  demographics_disagree:
    "The number matches, but the name, date of birth or hospital number does not",
  ambiguous: "The number matches more than one order",
  not_ordered: "The test is not on this specimen's order",
  already_released: "That result is already released: it would be an amendment",
  unit_differs: "The unit sent is not the one this test expects",
  code_unmapped: "The analyser code has no signed mapping",
  partner_not_enabled: "This partner's connection is not enabled",
};
const CHECK: Record<string, string> = {
  their_number: "Their number",
  name: "Name",
  birth_date: "Date of birth",
  hospital_number: "Hospital number",
  test: "Test",
  unit: "Unit",
};
const OUTCOME: Record<string, string> = {
  same: "Same",
  differs: "Differs",
  cannot_compare: "Cannot compare",
};

/**
 * Waiting for a match (Lab Phase 4 §5.7, artboard 7; MA-1..MA-9): results that did not file by themselves. The
 * reason is in words; the comparison says Same, Differs or Cannot compare; the values stay hidden until a
 * decision (MA-5). MedSync never creates a patient and never picks.
 */
export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  const { i } = await searchParams;
  const monthStart = new Date(`${kampalaToday().slice(0, 7)}-01T00:00:00+03:00`);
  const [items, month, colleagues] = await Promise.all([
    loadMatches(scope.hospitalId),
    matchMonth(scope.hospitalId, monthStart),
    db
      .selectDistinct({ id: users.id, name: users.fullName })
      .from(staffAffiliations)
      .innerJoin(users, eq(users.id, staffAffiliations.userId))
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, scope.hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
          inArray(cadres.code, ["LAB_TECH", "LAB_TECHNOLOGIST"]),
        ),
      ),
  ]);
  const sel = items.find((x) => x.id === i) ?? items[0] ?? null;
  const can =
    scope.access.permissions.has("lab.match.resolve") || scope.access.permissions.has("lab.manage");
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Waiting for a match"
      />
      <p role="note" className="border-border bg-muted text-body-s max-w-4xl rounded-md border p-3">
        {LAB4.matchingRule}
      </p>
      <div className={cn("grid gap-5", sel && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
        <div className="flex min-w-0 flex-col gap-3">
          {items.length === 0 ? (
            <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed p-8 text-center">
              Nothing is waiting.
            </p>
          ) : (
            <div className="border-border bg-card overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Waiting for a match</caption>
                <thead>
                  <tr className="bg-muted">
                    {["Arrived", "From", "In the message", "Why it is here"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr
                      key={x.id}
                      className={cn(
                        "border-ink-150 border-b last:border-b-0",
                        sel?.id === x.id && "bg-teal-50",
                      )}
                    >
                      <td className="text-body-s px-3 py-2 font-mono">
                        <Link href={`?i=${x.id}`} className="underline-offset-4 hover:underline">
                          {dateWords(x.arrivedAt)}
                        </Link>
                      </td>
                      <td className="text-body-s px-3 py-2">{x.from}</td>
                      <td className="text-body-s px-3 py-2">{x.about}</td>
                      <td className="px-3 py-2">
                        <StatusWord tone="caution">{REASON[x.reason] ?? x.reason}</StatusWord>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="text-body-s grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Filed by themselves", month.filedByThemselves],
              ["Waited here", month.waited],
              ["Filed after confirming", month.filedAfterConfirming],
              ["Sent back", month.sentBack],
            ].map(([k, v]) => (
              <div key={k as string} className="border-border bg-card rounded-md border p-3">
                <dt className="text-caption text-muted-foreground">{k} this month</dt>
                <dd className="text-heading-s font-mono tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {sel ? (
          <aside className="border-border bg-card flex h-fit flex-col gap-3 rounded-lg border p-4">
            <h2 className="text-heading-s">
              {sel.referralNumber ? `Against ${sel.referralNumber}` : "No order named"}
            </h2>
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Comparison</caption>
              <tbody>
                {sel.comparison.map((c) => (
                  <tr key={c.check} className="border-ink-150 border-b last:border-b-0">
                    <th
                      scope="row"
                      className="text-body-s text-muted-foreground py-1.5 pr-3 font-normal"
                    >
                      {CHECK[c.check] ?? c.check}
                    </th>
                    <td className="py-1.5">
                      {c.outcome === "same" ? (
                        <StatusWord glyph={CheckIcon} icon>
                          {OUTCOME.same}
                        </StatusWord>
                      ) : (
                        <StatusWord tone={c.outcome === "differs" ? "caution" : "neutral"}>
                          {OUTCOME[c.outcome]}
                        </StatusWord>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-caption text-muted-foreground">
              The values stay hidden until it is filed or sent back.
            </p>
            {can ? (
              <div className="flex flex-wrap gap-2">
                <ResolveDialog
                  itemId={sel.id}
                  action="asked_partner"
                  colleagues={colleagues}
                  primary
                />
                <ResolveDialog
                  itemId={sel.id}
                  action="file_after_confirming"
                  colleagues={colleagues.filter((c) => c.id !== scope.userId)}
                />
                <ResolveDialog itemId={sel.id} action="not_ours" colleagues={colleagues} />
                <ResolveDialog itemId={sel.id} action="set_aside" colleagues={colleagues} />
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
