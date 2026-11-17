"use client";

import type { HospitalAdminRow } from "../_lib/data";

import { ini, k } from "@/components/clinics-schedule/shared";
import { PEOPLE } from "@/content/hospital-admin/people";
import { fill } from "@/content/lab-workspace-v2";
import { dayText } from "../_lib/people";

const A = PEOPLE.admins;

/**
 * People › Admins: who holds the hospital admin role here, primary first. Read only: there is no action or Edge
 * Function to swap the primary and the backup yet, so the page offers none.
 */
export function AdminsList({ rows, me }: { rows: readonly HospitalAdminRow[]; me: string }) {
  return (
    <>
      <div className={k("su-card", "su-lr")} data-tour="wt-admins">
        <div className={k("su-ch")}>
          <b>{A.cardTitle}</b>
          <small>{A.cardSub}</small>
        </div>
        {rows.length ? (
          rows.map((a) => (
            <div key={a.userId} className={k("su-lri")}>
              <span className={k("pav")} aria-hidden="true">
                <b>{ini(a.fullName)}</b>
              </span>
              <span className={k("su-cn")}>
                <b>
                  {a.fullName}
                  {a.userId === me ? <span className={k("su-st", "ready")}>{A.you}</span> : null}
                </b>
                <small>{a.email}</small>
              </span>
              <span className={k("su-cn")}>
                <b className={k("su-lrimp")}>{A.designation[a.designation ?? "none"]}</b>
                <small>{fill(A.since, { date: dayText(a.sinceIso) })}</small>
              </span>
              <span className={k("su-hola")} />
            </div>
          ))
        ) : (
          <p className={k("su-none")}>{A.empty}</p>
        )}
      </div>
      <p className={k("su-note")}>{A.note}</p>
      <p className={k("su-note")}>{A.staffNote}</p>
    </>
  );
}
