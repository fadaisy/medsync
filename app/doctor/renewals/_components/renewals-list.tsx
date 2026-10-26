import type { RenewalRow } from "@/lib/emr/read/renewals";
import Link from "next/link";

import { Tag } from "@/components/clerking/plan/parts";
import { NETWORK_UI } from "@/content/pharmacy-network";
import { longDate } from "@/lib/prescribing/repeats";
import { ago } from "@/lib/workspace/words";
import { DoctorEmptyState } from "../../_components/empty-state";
import { RenewalAnswer } from "./renewal-answer";

/** 5.3's list, over its rows: the page reads them; the fixture catalogue passes demo rows (`demo`: nothing is sent). */
export function RenewalsList({
  rows,
  reasons,
  now,
  demo = false,
}: {
  rows: RenewalRow[];
  reasons: { code: string; words: string }[] | null;
  now: number;
  demo?: boolean;
}) {
  return (
    <>
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
                    href={
                      demo
                        ? "#renew"
                        : `/doctor/encounters/${r.encounterId}?renew=${r.id}&rx=${encodeURIComponent(r.drugId)}${r.conditionId ? `&for=${r.conditionId}` : ""}`
                    }
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
                  reasons={reasons}
                  demo={demo}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
