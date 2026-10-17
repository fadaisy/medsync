import type { Metadata } from "next";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rowsOf } from "@/lib/exchange/store";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { openRecordsRequests } from "@/lib/lab/patient-results";
import { FulfilButton } from "./fulfil-button";

export const metadata: Metadata = {
  title: "Copy requests · Hospital admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Copy requests (Lab Phase 5 PR-15): patients' "Ask for a copy of all my results", due within 30 days (DPPA 2019
 * s.24(9)). A hold in the app never blocks a lawful request; a held result is flagged so the clinician can be asked
 * first. Only the hospital number shows here.
 */
export default async function RecordsRequestsPage() {
  const scope = await requireHospitalAdminScope();
  const open = await openRecordsRequests(scope.hospitalId);
  const codes = new Map(
    open.length
      ? rowsOf<{ id: string; code: string | null }>(
          await db.execute(
            sql`SELECT id, patient_code AS code FROM patient_profiles WHERE id IN (${sql.join(
              open.map((o) => sql`${o.patientUserId}::uuid`),
              sql`, `,
            )})`,
          ),
        ).map((r) => [r.id, r.code])
      : [],
  );
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
      <h1 className="text-heading-l font-display">Copy requests</h1>
      <p className="text-body-s text-muted-foreground max-w-3xl">
        Each request is a patient&apos;s right of access. Reply within 30 days. A held result is
        still included: ask the clinician first.
      </p>
      {open.length === 0 ? (
        <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          No open requests.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((o) => (
            <li
              key={o.id}
              className="border-border bg-card text-body-s flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span>
                <span className="font-mono">{codes.get(o.patientUserId) ?? "No number"}</span> · due{" "}
                <span className="font-mono">{o.dueOn}</span>
                {o.held ? " · A result is held in the app: ask the clinician first" : ""}
              </span>
              <FulfilButton id={o.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
