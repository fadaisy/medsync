import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { fill, LAB5 } from "@/content/lab-phase-5";
import { patientResultsLiveFor } from "@/lib/lab/feature";
import { oneResult, recordView } from "@/lib/lab/patient-results";
import { requirePatientScope } from "@/lib/patient/scope";
import { RangeLine, WORD } from "../_components/range-line";
import { PatientPageHeader } from "../../_components/page-header";

// PR-14: no test or value in the tab title.
export const metadata: Metadata = { title: "Result · MedSync" };
export const dynamic = "force-dynamic";

const card = "border-border bg-card flex flex-col gap-2 rounded-lg border p-4";

/**
 * One result (Lab Phase 5 §5.2, artboard 2): value and status word, the range line, what this test is in signed
 * plain words, earlier results, what next, and where it came from. Opening it records the view (PR-13), which the
 * doctor sees as "Seen by the patient".
 */
export default async function PatientResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId || !patientResultsLiveFor(scope.primaryHospitalId)) notFound();
  const { reportId } = await params;
  const subject = (await searchParams).for ?? scope.userId;
  const viewer = { userId: scope.userId, subjectUserId: subject };
  // PR-17: explanations in the patient's language when signed, else English.
  const r = await oneResult(viewer, reportId, new Date(), "en");
  if (!r) notFound();
  const { card: c } = r;
  if (!c.beingChecked) await recordView(viewer, reportId, (await headers()).get("user-agent"));
  const q = subject === scope.userId ? "" : `?for=${subject}`;
  return (
    <div className="flex flex-col gap-6">
      <PatientPageHeader
        eyebrow={`MedSync · ${c.hospitalName}`}
        title={c.test}
        description={<span className="font-mono">{c.releasedOn}</span>}
        backHref={`/patient/results${q}`}
        backLabel="Back to results"
      />
      {c.beingChecked ? (
        <p className={`${card} text-body`}>{LAB5.beingChecked}</p>
      ) : (
        c.values.map((v) => {
          const w = v.concept ? r.words[v.concept] : null;
          return (
            <section key={v.name} className={card} aria-label={v.name}>
              {c.values.length > 1 ? <h2 className="text-heading-s">{v.name}</h2> : null}
              <p className="text-heading-m font-mono tabular-nums">
                {v.value} <span className="text-body">{v.unit}</span>
              </p>
              <p className="text-body font-medium">{WORD[v.word]}</p>
              <RangeLine v={v} />
              {c.values.length > 1 ? (
                <h3 className="text-heading-s">What this test is</h3>
              ) : (
                <h2 className="text-heading-s">What this test is</h2>
              )}
              <p className="text-body-s">{w ? w.whatThisTestIs : LAB5.noPlainWords}</p>
              {w ? (
                <p className="text-body-s">
                  {
                    w.action[
                      v.word === "within"
                        ? "within"
                        : v.word === "higher"
                          ? "higher"
                          : v.word === "lower"
                            ? "lower"
                            : "noRange"
                    ]
                  }
                </p>
              ) : null}
            </section>
          );
        })
      )}
      {c.correctedOn && r.earlierValue ? (
        <p className="text-body-s">
          {fill(LAB5.corrected, { date: c.correctedOn })} Earlier ({r.earlierValue.on}):{" "}
          {r.earlierValue.values.map((v) => (
            <s key={v.name} className="font-mono">
              {v.value} {v.unit}{" "}
            </s>
          ))}
        </p>
      ) : null}
      {r.earlier.length ? (
        <section className={card} aria-labelledby="earlier">
          <h2 id="earlier" className="text-heading-s">
            Earlier results
          </h2>
          <ul className="flex flex-col gap-1">
            {r.earlier.map((e) => (
              <li key={e.reportId} className="text-body-s">
                <span className="font-mono">{e.releasedOn}</span> ·{" "}
                {e.values
                  .map((v) => `${v.value} ${v.unit} (${WORD[v.word].toLowerCase()})`)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={card} aria-labelledby="next">
        <h2 id="next" className="text-heading-s">
          Next
        </h2>
        {c.note ? <p className="text-body-s">{c.note}</p> : null}
        <p className="text-body-s">{LAB5.nextFixed}</p>
      </section>
      <p className="text-caption text-muted-foreground">
        {c.partner ? `Done at ${c.partner}. ` : c.bedside ? "Measured on the ward. " : ""}
        {c.reviewedOn
          ? fill(LAB5.provenance, {
              hospital: c.hospitalName,
              date: c.releasedOn,
              date2: c.reviewedOn,
            })
          : null}
      </p>
    </div>
  );
}
