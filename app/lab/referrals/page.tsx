import type { ReferralRow } from "@/lib/lab/referral-read";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LAB } from "@/content/lab";
import { LAB4 } from "@/content/lab-phase-4";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { loadPartners, loadReferralEvents, loadReferrals } from "@/lib/lab/referral-read";
import { nowWords } from "@/lib/lab/referral-words";
import { cn } from "@/lib/utils";
import { dateWords } from "../_lib/days";
import { NowChip } from "./_components/now-chip";
import { CallDialog, CancelDialog, LostDialog, UpdateDialog } from "./_components/referral-forms";

export const metadata: Metadata = { title: "Referrals · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

type View = "all" | "sent" | "back" | "waiting" | "overdue" | "rejected";
const TERMINAL = new Set(["completed", "failed", "lost", "cancelled", "rejected"]);
const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return {
    from: new Date(Date.UTC(y, mo - 1, 1) - 3 * 3_600_000),
    to: new Date(Date.UTC(y, mo, 1) - 3 * 3_600_000),
  };
};
const thisMonth = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 7);

/**
 * Referrals (Lab Phase 4 §5.3, artboard 3): where every referred specimen is, who said so, and when it is
 * expected back. Every tile opens the referrals behind it; an empty month says "No data", never 0. Expected is the
 * partner's stated turnaround added to the handover, not a clinical target (D-LAB4-04).
 */
export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; partner?: string; view?: string; r?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  const q = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : thisMonth();
  const view: View =
    (["all", "sent", "back", "waiting", "overdue", "rejected"] as const).find(
      (v) => v === q.view,
    ) ?? "all";
  const { from, to } = monthBounds(month);
  const [rows, partners] = await db.transaction(
    async (tx) =>
      [
        await loadReferrals(tx, scope.hospitalId, { from, to, partnerId: q.partner ?? null }),
        await loadPartners(tx, scope.hospitalId),
      ] as const,
  );
  const events =
    q.r && rows.some((r) => r.id === q.r)
      ? await db.transaction((tx) => loadReferralEvents(tx, scope.hospitalId, q.r!))
      : [];
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.patientUserId),
    "lab_referrals",
  );
  const inMonth = (d: Date | null) => !!d && d >= from && d < to;
  const sets: Record<View, ReferralRow[]> = {
    all: rows,
    sent: rows.filter((r) => inMonth(r.sentAt)),
    back: rows.filter((r) => r.state === "completed" && inMonth(r.completedAt)),
    waiting: rows.filter((r) => r.sentAt && !TERMINAL.has(r.state)),
    overdue: rows.filter((r) => r.overdueDays),
    rejected: rows.filter((r) => r.state === "rejected"),
  };
  const back = sets.back.filter((r) => r.sentAt);
  const avgDays = (rs: ReferralRow[]) =>
    rs.length
      ? Math.round(
          (rs.reduce((s, r) => s + (r.completedAt!.getTime() - r.sentAt!.getTime()), 0) /
            rs.length /
            86_400_000) *
            10,
        ) / 10
      : null;
  const perPartner = [...new Set(back.map((r) => r.partner))].map(
    (p) => `${p} ${avgDays(back.filter((r) => r.partner === p))}`,
  );
  const empty = rows.length === 0;
  const tile = (v: View, label: string, value: string, sub?: string) => (
    <Link
      href={`?month=${month}${q.partner ? `&partner=${q.partner}` : ""}&view=${v}`}
      className={cn(
        "border-border bg-card hover:bg-ink-50 flex flex-col gap-1 rounded-lg border p-3",
        view === v && "ring-ring ring-2",
      )}
    >
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="text-heading-m font-mono tabular-nums">{empty ? LAB4.noData : value}</span>
      {sub && !empty ? <span className="text-caption text-muted-foreground">{sub}</span> : null}
    </Link>
  );
  const shown = sets[view];
  const sel = rows.find((r) => r.id === q.r) ?? null;
  const step = (done: boolean, late: boolean, label: string, when: string) => (
    <li
      className={cn(
        "text-caption flex flex-col gap-1 border-t-[3px] pt-2",
        done ? "border-teal-600" : late ? "border-status-caution-fg" : "border-ink-150",
      )}
    >
      <b className={cn("text-body-s", late && "text-status-caution-fg-aa")}>{label}</b>
      <span>{done ? when : late ? `${when}, late` : when}</span>
    </li>
  );
  const reached = (k: string) => events.some((e) => e.applied && e.kind === k);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="Referrals" />
      <form className="flex flex-wrap items-end gap-3" action="/lab/referrals">
        <label className="text-body-s flex flex-col gap-1">
          <span className="text-muted-foreground">Destination</span>
          <select
            name="partner"
            defaultValue={q.partner ?? ""}
            className="border-input bg-card min-h-11 rounded-sm border px-2 sm:min-h-9"
          >
            <option value="">All destinations</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-body-s flex flex-col gap-1">
          <span className="text-muted-foreground">Month</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="border-input bg-card min-h-11 rounded-sm border px-2 sm:min-h-9"
          />
        </label>
        <button
          type="submit"
          className={buttonVariants({ variant: "secondary", className: "min-h-11 sm:min-h-9" })}
        >
          Show
        </button>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tile("sent", "Sent this month", String(sets.sent.length))}
        {tile("back", "Results back", String(sets.back.length), "On the original order")}
        {tile(
          "waiting",
          "Waiting for a result",
          String(sets.waiting.length),
          `${sets.overdue.length} overdue`,
        )}
        {tile(
          "back",
          "Sent to result back, average",
          avgDays(back) === null ? LAB4.noData : `${avgDays(back)} days`,
          perPartner.join(" · "),
        )}
        {tile("rejected", "Rejected by the reference lab", String(sets.rejected.length))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-3">
          {shown.length === 0 ? (
            <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed p-8 text-center">
              {LAB4.noData}
            </p>
          ) : (
            <div className="border-border bg-card overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Referrals</caption>
                <thead>
                  <tr className="bg-muted">
                    {["Referral", "Patient", "Test", "To", "Sent", "Now", "Expected"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const id = ids.get(r.patientUserId);
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-ink-150 border-b last:border-b-0",
                          sel?.id === r.id && "bg-teal-50",
                        )}
                      >
                        <td className="text-body-s px-3 py-2 font-mono">
                          <Link
                            href={`?month=${month}&view=${view}${q.partner ? `&partner=${q.partner}` : ""}&r=${r.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {r.number}
                          </Link>
                        </td>
                        <td className="text-body-s px-3 py-2">
                          {id?.name ?? "Name withheld"}
                          <br />
                          <span className="text-caption text-muted-foreground font-mono">
                            {id?.mrn}
                          </span>
                        </td>
                        <td className="text-body-s px-3 py-2">
                          {r.test}
                          {r.restricted ? (
                            <span className="text-caption text-muted-foreground">
                              {" "}
                              · Restricted
                            </span>
                          ) : null}
                        </td>
                        <td className="text-body-s px-3 py-2">{r.partner}</td>
                        <td className="text-body-s px-3 py-2 font-mono">
                          {r.sentAt ? dateWords(r.sentAt) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <NowChip now={nowWords(r)} />
                        </td>
                        <td className="text-body-s px-3 py-2 font-mono">
                          {r.expected ? dateWords(r.expected) : r.sentAt ? "Not stated" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-caption text-muted-foreground max-w-3xl">
            Expected adds the destination&apos;s stated turnaround for the test to the time it was
            handed over. It is the destination&apos;s figure, not a clinical target. These counts
            fill HMIS 105 section 10.4.
          </p>
        </div>
        {sel ? (
          <aside className="border-border bg-card flex h-fit flex-col gap-4 rounded-lg border p-4">
            <h2 className="text-heading-s">
              {sel.number} · {sel.test}
            </h2>
            <ol className="grid grid-cols-5 gap-1" aria-label="Where it is">
              {step(!!sel.sentAt, false, "Sent", sel.sentAt ? dateWords(sel.sentAt) : "Not yet")}
              {step(
                reached("handed_over"),
                false,
                "With rider",
                reached("handed_over") ? "Yes" : "Not yet",
              )}
              {step(
                reached("at_hub"),
                false,
                "At hub",
                reached("at_hub") ? "Yes" : "Not confirmed",
              )}
              {step(
                reached("received_by_lab") || reached("accepted") || reached("in_progress"),
                !!sel.overdueDays,
                "At the lab",
                reached("received_by_lab") || reached("accepted") || reached("in_progress")
                  ? "Yes"
                  : "Not confirmed",
              )}
              {step(
                sel.state === "completed",
                !!sel.overdueDays,
                "Result",
                sel.state === "completed"
                  ? "Back"
                  : sel.expected
                    ? `Due ${dateWords(sel.expected)}`
                    : "Not stated",
              )}
            </ol>
            <ul className="flex flex-col gap-3">
              {events.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "text-body-s grid grid-cols-[88px_minmax(0,1fr)] gap-2",
                    !e.applied && "text-muted-foreground",
                  )}
                >
                  <span className="text-caption font-mono">{dateWords(e.eventAt)}</span>
                  <span>
                    {e.kind.replaceAll("_", " ")}
                    {e.reasonCode ? `: ${e.reasonCode.replaceAll("_", " ")}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                    <span className="text-caption text-muted-foreground block">
                      {e.source === "partner_message"
                        ? `From their system, message ${e.messageId?.slice(0, 8)}`
                        : e.source === "system"
                          ? "MedSync"
                          : `${e.who ?? "Lab"}${e.document ? ` · from ${e.document.replaceAll("_", " ")}` : ""}`}
                      {!e.applied ? " · arrived late, not applied" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {!TERMINAL.has(sel.state) ? (
                <>
                  <UpdateDialog referralId={sel.id} number={sel.number} />
                  <CallDialog referralId={sel.id} number={sel.number} />
                  <CancelDialog referralId={sel.id} number={sel.number} />
                  {sel.sentAt ? <LostDialog referralId={sel.id} number={sel.number} /> : null}
                </>
              ) : null}
              {sel.sentAt &&
              sel.state !== "completed" &&
              sel.state !== "lost" &&
              sel.state !== "rejected" &&
              sel.routine ? (
                <Link
                  href={`/lab/referrals/${sel.id}/result`}
                  className={buttonVariants({ className: "min-h-11 sm:min-h-8" })}
                >
                  Enter the result
                </Link>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
