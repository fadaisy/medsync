import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { SectionNumber } from "@/components/medsync/section-number";
import { PHARMACY } from "@/content/pharmacy";
import { expiryText } from "@/content/pharmacy-stock";
import { REQUISITION_STATE_WORDS, STORE, STORES_B } from "@/content/pharmacy-stores-store";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { witnessCandidates } from "@/lib/pharmacy/controlled-read";
import { pharmacyStoreLiveFor } from "@/lib/pharmacy/feature";
import { getRequisition } from "@/lib/pharmacy/stores/store-read";
import { IssueForm, RefuseDialog, VoucherPrint } from "../_components/issue-dialogs";

export const metadata: Metadata = { title: "Requisition · Pharmacy" };
export const dynamic = "force-dynamic";

const at = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

/**
 * The issuing screen (Pharmacy Phase 2, 5.3): the requisition, then per line what was asked, what this place
 * holds, the batch that expires first, and the quantity to issue, pre-filled with what was asked and capped at
 * what is held (IS-2). A line issued as zero is "Not issued" with its reason. Issued, it prints the Requisition
 * and Issue Voucher (hospital layout not confirmed), logged.
 */
export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePharmacyActor();
  if (!pharmacyStoreLiveFor(actor.hospitalId)) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [v, witnesses] = await Promise.all([
    getRequisition(actor, id),
    witnessCandidates(db, actor.hospitalId, actor.userId),
  ]);
  if (!v) notFound();
  const r = v.requisition;
  const p = actor.access.permissions;
  const canIssue =
    p.has("pharmacy.store") ||
    (p.has("pharmacy.dispense") && actor.pointId === r.issuingLocationId);
  const S = STORE.issue;
  const V = STORE.voucher;
  const fromName = v.from?.name ?? "";
  const atName = v.at?.name ?? "";
  const issue = v.issues[0] ?? null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          place={PHARMACY.place}
          placeInTopBar
          title={S.title(fromName, atName)}
          subline={
            <Link
              href="/pharmacy/store/issues"
              className="text-body-s text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {STORE.issues.title}
            </Link>
          }
          right={
            r.state === "raised" ? (
              <StatusWord tone="caution">{REQUISITION_STATE_WORDS.raised}</StatusWord>
            ) : (r.state === "issued" || r.state === "part_issued") && issue ? (
              <StatusWord tone="caution">
                {STORES_B.issuedUnconfirmed(at.format(issue.issuedAt), fromName)}
              </StatusWord>
            ) : (
              <StatusWord>{REQUISITION_STATE_WORDS[r.state]}</StatusWord>
            )
          }
        />
        <section aria-labelledby="r1" className="flex flex-col gap-2">
          <h2 id="r1" className="text-heading-s inline-flex items-center gap-2">
            <SectionNumber n={1} />
            {S.header}
          </h2>
          <p className="text-body-s">
            {S.raisedBy(at.format(r.raisedAt))} · {v.raisedByName}
          </p>
          <p className="text-body-s text-muted-foreground">
            {v.lastCountAt ? `${STORE.places.count}: ${at.format(v.lastCountAt)}` : S.countOnWard}
          </p>
          {r.refusedReason ? <p className="text-body-s">{r.refusedReason}</p> : null}
          {issue ? (
            <p className="text-body-s">
              {S.issued(at.format(issue.issuedAt))} · {issue.issuedByName}
              {issue.confirmedAt
                ? ` · ${REQUISITION_STATE_WORDS[r.state]} ${at.format(issue.confirmedAt)}`
                : ""}
            </p>
          ) : null}
        </section>
        <section aria-labelledby="r2" className="flex flex-col gap-3">
          <h2 id="r2" className="text-heading-s inline-flex items-center gap-2">
            <SectionNumber n={2} />
            {S.lines}
          </h2>
          {r.state === "raised" && canIssue ? (
            <>
              <IssueForm
                requisitionId={r.id}
                witnesses={witnesses}
                lines={v.lines.map((l) => ({
                  id: l.id,
                  productName: l.productName,
                  issueUnit: l.issueUnit,
                  asked: l.asked,
                  held: l.held,
                  prefill: l.prefill,
                  first: l.first ? `${expiryText(l.first)} · ${l.first.batchNumber}` : null,
                  controlled: l.controlled,
                  decided: l.issued !== null,
                  picked: l.pick === undefined ? undefined : (l.pick?.method ?? null),
                }))}
              />
              <span className="flex flex-wrap gap-2">
                <RefuseDialog requisitionId={r.id} label={S.refuse} />
                {v.lines
                  .filter((l) => l.issued === null)
                  .map((l) => (
                    <RefuseDialog
                      key={l.id}
                      requisitionId={r.id}
                      lineId={l.id}
                      label={`${S.refuseLine}: ${l.productName}`}
                    />
                  ))}
              </span>
            </>
          ) : (
            <ul className="text-body-s flex flex-col gap-1">
              {v.lines.map((l) => (
                <li key={l.id}>
                  {l.productName}: {l.asked} ·{" "}
                  {l.issued === null ? (
                    "—"
                  ) : l.issued === 0 ? (
                    <StatusWord tone="caution">{`${S.notIssued}: ${l.notIssuedReason ?? ""}`}</StatusWord>
                  ) : (
                    STORE.amounts(l.issued, l.issueUnit)
                  )}
                </li>
              ))}
            </ul>
          )}
          {r.state !== "raised" && r.state !== "withdrawn" && p.has("pharmacy.store") ? (
            <VoucherPrint requisitionId={r.id} />
          ) : null}
        </section>
      </div>

      <section data-print-section="voucher" className="hidden flex-col gap-3 print:flex">
        <h1 className="text-heading-m">{V.title}</h1>
        <p className="text-body-s">
          {STORES_B.columnsUnconfirmed("Requisition and Issue Voucher")}
        </p>
        <p className="text-body-s">
          {v.hospitalName} · {fromName} → {atName} · {at.format(r.raisedAt)}
        </p>
        <table className="text-body-s w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th scope="col">{V.columns.product}</th>
              <th scope="col">{V.columns.asked}</th>
              <th scope="col">{V.columns.issued}</th>
              <th scope="col">{V.columns.batch}</th>
              <th scope="col">{V.columns.expiry}</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l) => (
              <tr key={l.id} className="border-b align-top">
                <td>{l.productName}</td>
                <td>{l.asked}</td>
                <td>
                  {l.issued === 0 ? `${V.zero} (${l.notIssuedReason ?? ""})` : (l.issued ?? "")}
                </td>
                <td>{l.issuedRows.map((x) => `${x.batchNumber} · ${x.quantity}`).join("; ")}</td>
                <td>{l.issuedRows.map((x) => expiryText(x)).join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 grid grid-cols-3 gap-6">
          {[V.requested, V.issued, V.received].map((s) => (
            <div key={s} className="flex flex-col gap-8">
              <span className="text-body-s">{s}</span>
              <span className="text-caption border-t pt-1">{STORE.report.signature}</span>
            </div>
          ))}
        </div>
        <p className="text-caption">{V.stamp}</p>
      </section>
    </div>
  );
}
