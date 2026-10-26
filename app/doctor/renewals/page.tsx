import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Tag } from "@/components/clerking/plan/parts";
import { NETWORK_UI } from "@/content/pharmacy-network";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { openRenewals } from "@/lib/emr/read/renewals";
import { pharmacyRepeatsLiveFor } from "@/lib/pharmacy/feature";
import { networkPack } from "@/lib/pharmacy/network-packs";
import { longDate } from "@/lib/prescribing/repeats";
import { ago } from "@/lib/workspace/words";
import { DoctorEmptyState } from "../_components/empty-state";
import { RenewalAnswer } from "./_components/renewal-answer";

export const metadata: Metadata = { title: "Renewal requests · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Pharmacy Phase 4, 5.3: renewal requests for prescribers at this hospital, oldest first. Renew opens the
 * prescribing dialog pre-loaded on the patient's visit; Book a visit and Decline answer here. A request stays listed
 * until answered (Phase 1 Law 4). Behind PHARMACY_REPEATS; off, the page is not found.
 */
export default async function RenewalsPage() {
  const scope = await requireDoctorScope();
  if (!pharmacyRepeatsLiveFor(scope.hospitalId)) notFound();
  const db = (await import("@/db")).db as unknown as Parameters<typeof networkPack>[0];
  const [rows, reasons] = await Promise.all([
    openRenewals({ userId: scope.userId, hospitalId: scope.hospitalId }),
    networkPack(db, scope.hospitalId, "renewal_decline_reasons"),
  ]);
  const now = new Date().getTime();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
          Prescribing
        </span>
        <h1 className="font-display text-display-s text-foreground">Renewal requests</h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          A refill the repeats do not cover comes here. Nothing renews by itself: Renew places a new
          prescription, Book a visit or Decline tells the patient and the pharmacy.
        </p>
      </header>
      {rows.length === 0 ? (
        <DoctorEmptyState
          title="No renewal requests"
          body="Requests from the pharmacy and patients appear here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="border-border bg-card flex flex-col gap-3 rounded-lg border p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-body-m text-foreground">
                  {r.name} <span className="text-muted-foreground font-mono">{r.mrn}</span>
                </span>
                <span className="text-caption text-muted-foreground">
                  Waiting {ago(now - Date.parse(r.waitingSince))}
                </span>
              </div>
              <dl className="text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <div>
                  <dt className="text-caption text-muted-foreground">Medicine</dt>
                  <dd>{r.medicine}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Why</dt>
                  <dd>
                    <Tag>
                      {
                        NETWORK_UI.renewalReasons[
                          r.reason as keyof typeof NETWORK_UI.renewalReasons
                        ]
                      }
                    </Tag>
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Last supplied</dt>
                  <dd>{r.lastSuppliedOn ? longDate(r.lastSuppliedOn) : "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">Repeats used</dt>
                  <dd>
                    {r.authorised === null
                      ? "No repeats authorised"
                      : `${r.used} of ${r.authorised}`}
                  </dd>
                </div>
                {r.reviewBy ? (
                  <div>
                    <dt className="text-caption text-muted-foreground">Review by</dt>
                    <dd>{longDate(r.reviewBy)}</dd>
                  </div>
                ) : null}
                {r.note ? (
                  <div className="sm:col-span-2">
                    <dt className="text-caption text-muted-foreground">Note</dt>
                    <dd>{r.note}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                {r.encounterId ? (
                  <Link
                    className="bg-primary text-primary-foreground text-body-s inline-flex min-h-9 items-center rounded-md px-3"
                    href={`/doctor/encounters/${r.encounterId}?renew=${r.id}&rx=${encodeURIComponent(r.drugId)}${r.conditionId ? `&for=${r.conditionId}` : ""}`}
                  >
                    Renew
                  </Link>
                ) : (
                  <span className="text-body-s text-muted-foreground">
                    Open a visit for this patient to renew.
                  </span>
                )}
                <RenewalAnswer
                  patientUserId={r.patientUserId}
                  renewalId={r.id}
                  reasons={reasons?.content.items ?? null}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
