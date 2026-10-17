import "server-only";

import type { Provenance } from "./referral-results";
import type { EmrDb } from "@/lib/emr/db";
import { and, inArray, isNotNull } from "drizzle-orm";

import { diagnosticReports, labResultAttachments, users } from "@/db/schema";
import { provenanceLines } from "./referral-results";

const at = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

/**
 * §5.5, RB-8: for each referred report, the partner, the provenance lines in Appendix A's words (names resolved
 * here, never stored as names), and whether the scan of the paper report exists.
 */
export async function referredProvenance(
  conn: EmrDb,
  reportIds: string[],
): Promise<Map<string, { partner: string; lines: string[]; hasScan: boolean }>> {
  if (!reportIds.length) return new Map();
  const rows = await conn
    .select({
      id: diagnosticReports.id,
      referralId: diagnosticReports.referralId,
      provenance: diagnosticReports.provenance,
      recordedAt: diagnosticReports.recordedAt,
      by: diagnosticReports.recordedByUserId,
    })
    .from(diagnosticReports)
    .where(and(inArray(diagnosticReports.id, reportIds), isNotNull(diagnosticReports.referralId)));
  if (!rows.length) return new Map();
  const ps = rows.map((r) => r.provenance as Provenance & { calledWard?: string | null });
  const people = [
    ...new Set(ps.flatMap((p) => [p.enteredBy, p.checkedBy]).filter((x): x is string => !!x)),
  ];
  const names = new Map(
    people.length
      ? (
          await conn
            .select({ id: users.id, name: users.fullName })
            .from(users)
            .where(inArray(users.id, people))
        ).map((u) => [u.id, u.name])
      : [],
  );
  const scans = new Set(
    (
      await conn
        .select({ referralId: labResultAttachments.referralId })
        .from(labResultAttachments)
        .where(
          inArray(
            labResultAttachments.referralId,
            rows.map((r) => r.referralId!),
          ),
        )
    ).map((s) => s.referralId),
  );
  return new Map(
    rows.map((r, i) => {
      const p = ps[i]!;
      return [
        r.id,
        {
          partner: p.partner,
          lines: provenanceLines(p, {
            enteredBy: p.enteredBy ? (names.get(p.enteredBy) ?? "the lab") : undefined,
            checkedBy: p.checkedBy ? (names.get(p.checkedBy) ?? "a second person") : "nobody yet",
            filedBy: names.get(r.by) ?? "the lab",
            reportedAt: p.reportedAt ?? at.format(r.recordedAt),
          }),
          hasScan: scans.has(r.referralId!),
        },
      ];
    }),
  );
}
