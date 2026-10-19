import type { ReferralRow } from "@/lib/lab/referral-read";

import { NowChip } from "@/components/lab/now-chip";
import { nowWords } from "@/lib/lab/referral-words";

const day = (d: Date) =>
  d
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Kampala" })
    .toUpperCase();

/**
 * "Sent out, waiting" (Lab Phase 4 §5.5, artboard 5): the clinician's patients' tests at a reference lab, with
 * where each is and when it is expected. Overdue says the lab is following up. Restricted tests are named only
 * as restricted (Law 12).
 */
export function SentOut({
  rows,
  ids,
}: {
  rows: ReferralRow[];
  ids: Map<string, { name: string; mrn: string }>;
}) {
  if (!rows.length) return null;
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-heading-s">Sent out, waiting</h2>
      <div className="overflow-auto" tabIndex={0} role="region" aria-label="Sent out, waiting">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Tests sent to a reference lab</caption>
          <thead>
            <tr className="bg-muted">
              {["Patient", "Test", "Now", "Expected"].map((h) => (
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
            {rows.map((r) => {
              const now = nowWords(r);
              const p = ids.get(r.patientUserId);
              return (
                <tr key={r.id} className="border-ink-150 border-b last:border-b-0">
                  <td className="text-body-s px-3 py-2">
                    {p?.name ?? "Name withheld"}{" "}
                    <span className="text-muted-foreground font-mono">{p?.mrn}</span>
                  </td>
                  <td className="text-body-s px-3 py-2">
                    {r.restricted ? "Restricted test" : r.test} · {r.partner}
                  </td>
                  <td className="px-3 py-2">
                    <NowChip
                      now={r.overdueDays ? { ...now, words: "Overdue · lab following up" } : now}
                    />
                  </td>
                  <td className="text-body-s px-3 py-2 font-mono">
                    {r.expected ? day(r.expected) : "Not stated"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
