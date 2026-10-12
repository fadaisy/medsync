import type { FeedResult, FieldValue } from "@/lib/ncd/lab-feed";
import type { FeedField, FeedView, OutsideResult } from "@/lib/ncd/lab-feed-read";

import { LAB2 } from "@/content/lab-phase-2";
import { FEED_FIELDS, outsideUnits } from "@/lib/ncd/lab-feed-read";
import { ClassChip, fmtDate, fmtDateTime, Num } from "../../../_components/kit";
import { OutsideResultButton } from "./outside-result";

const REASON: Record<Extract<FieldValue, { kind: "none" }>["reason"], string> = {
  none_in_window: "",
  unit_differs: "The results in the window are in another unit.",
  method_not_accepted:
    "The results in the window were measured by a method this field does not accept.",
  restricted: "The results in the window are restricted and cannot fill this field.",
  not_mapped: "This field is not mapped.",
};

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * Artboard 9 (Lab Phase 2 §5.9, NF-1..NF-7): each mapped registry field filled from released results, read
 * only. A field with no usable result says why, lists every result it could not use, and offers an outside
 * result. Server-rendered; only the outside-result dialog is a client island.
 */
export function FromTheLab({
  feed,
  outside,
  visitId,
  today,
  timeZone,
  canWrite,
}: {
  feed: FeedView;
  outside: OutsideResult[];
  visitId: string;
  today: string;
  timeZone: string;
  canWrite: boolean;
}) {
  const when = (d: Date) => fmtDateTime(d, timeZone);
  const source = (r: FeedResult) =>
    LAB2.ncd.filled(r.method === "lab" ? "Lab" : "Bedside", when(r.releasedAt));
  const mapped = Object.entries(feed.mappings) as [
    FeedField,
    NonNullable<FeedView["mappings"][FeedField]>,
  ][];

  return (
    <section aria-labelledby="lab-h" className="border-border rounded-xl border p-4">
      <h2 id="lab-h" className="text-heading-s mb-3">
        From the lab
      </h2>
      {!mapped.length ? (
        <p className="text-body-s text-ink-700">
          The lab feed is not set up yet: the registry lead maps each field.
        </p>
      ) : (
        <>
          {!feed.linked ? (
            <p className="text-body-s text-ink-700 mb-3">
              This person is not linked to a hospital record, so lab results cannot fill this visit.
            </p>
          ) : null}
          <ul className="divide-border flex flex-col divide-y">
            {mapped.map(([f, m]) => {
              const v = feed.fields[f];
              const mine = outside.filter((o) => o.field === f);
              return (
                <li key={f} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-label">{FEED_FIELDS[f].label}</span>
                    {v?.kind === "filled" ? (
                      <span className="flex items-center gap-2">
                        <Num className="text-body-m">
                          {v.result.value} {v.result.unit}
                        </Num>
                        <ClassChip label="Filled" leading />
                      </span>
                    ) : null}
                  </div>
                  {v?.kind === "filled" ? (
                    <>
                      <p className="text-caption text-ink-600">{source(v.result)}</p>
                      {v.result.amended ? (
                        <p className="text-caption text-ink-700">
                          {LAB2.ncd.amended(when(v.result.releasedAt))}
                        </p>
                      ) : null}
                      {v.previous ? (
                        <p className="text-caption text-ink-600">
                          Previous{" "}
                          <Num>
                            {v.previous.value} {v.previous.unit}
                          </Num>
                          , {source(v.previous)}
                        </p>
                      ) : null}
                    </>
                  ) : feed.linked && v ? (
                    <>
                      <p className="text-body-s text-ink-700">
                        {v.reason === "none_in_window"
                          ? LAB2.ncd.none(days(m.payload.windowDays))
                          : REASON[v.reason]}
                      </p>
                      {v.unusable.length ? (
                        <ul className="text-caption text-ink-600 flex flex-col gap-0.5">
                          {v.unusable.map((u) => (
                            <li key={`${u.observationId}-${u.version}`}>
                              {LAB2.ncd.unitDiffers(u.value, u.unit, when(u.releasedAt))}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                  {mine.map((o) => (
                    <p key={o.at} className="text-caption text-ink-700">
                      {LAB2.ncd.outside(o.laboratory, fmtDate(o.date))}:{" "}
                      <Num>
                        {o.value} {o.unit}
                      </Num>{" "}
                      as printed
                      {o.unit !== o.canonicalUnit ? (
                        <>
                          , converted{" "}
                          <Num>
                            {o.canonical.toLocaleString("en-GB", { maximumFractionDigits: 2 })}{" "}
                            {o.canonicalUnit}
                          </Num>
                        </>
                      ) : null}
                    </p>
                  ))}
                  {v?.kind !== "filled" && canWrite ? (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <span className="text-caption text-ink-600">
                        Order it from the patient&apos;s visit
                      </span>
                      <OutsideResultButton
                        visitId={visitId}
                        field={f}
                        label={FEED_FIELDS[f].label}
                        units={outsideUnits(m.payload.concept, m.payload.unit)}
                        today={today}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="text-caption text-muted-foreground mt-3">{LAB2.ncd.readOnly}</p>
        </>
      )}
    </section>
  );
}
