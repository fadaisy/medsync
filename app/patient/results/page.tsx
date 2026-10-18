import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fill, LAB5 } from "@/content/lab-phase-5";
import { patientResultsLiveFor, patientResultsSmsLiveFor } from "@/lib/lab/feature";
import { myChildren, resultsFor } from "@/lib/lab/patient-results";
import { hasSmsConsent } from "@/lib/notifications/consent";
import { requirePatientScope } from "@/lib/patient/scope";
import { PatientPageHeader } from "../_components/page-header";
import { WORD } from "./_components/range-line";
import { AskForCopy, ResultsConsentSwitch } from "./_components/results-controls";
import { identifiers } from "./_lib/identity";

// PR-14: no name, test or value in the tab title.
export const metadata: Metadata = { title: "Results · MedSync" };
export const dynamic = "force-dynamic";

const card = "border-border bg-card flex flex-col gap-2 rounded-lg border p-4";

/**
 * My results (Lab Phase 5 §5.1, artboard 1). Behind `patientResults` at the patient's hospital. Ready results first,
 * then "Not ready to show yet" with one line each, the in-person footer, and the patient's choices. A guardian opens
 * a linked child with `?for=`. Nothing here is cached on the device (PR-14): the page is rendered per request.
 */
export default async function PatientResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId || !patientResultsLiveFor(scope.primaryHospitalId)) notFound();
  const subject = (await searchParams).for ?? scope.userId;
  const now = new Date();
  const sms = patientResultsSmsLiveFor(scope.primaryHospitalId);
  const [res, children, consent, who, smsOn, mine] = await Promise.all([
    resultsFor({ userId: scope.userId, subjectUserId: subject }, now),
    myChildren(scope.userId),
    hasSmsConsent(subject, "results_in_app"),
    identifiers(subject),
    sms ? hasSmsConsent(scope.userId, "results_sms") : Promise.resolve(false),
    sms ? identifiers(scope.userId) : Promise.resolve(null),
  ]);
  if (!res) notFound();
  const forChild = res.kind === "guardian";
  const q = forChild ? `?for=${subject}` : "";
  return (
    <div className="flex flex-col gap-6">
      <PatientPageHeader
        eyebrow={`MedSync · ${scope.primaryHospitalName ?? "Results"}`}
        title={forChild ? `Results for ${who.name}` : "My results"}
        description={
          <span>
            {who.name}
            {who.number ? (
              <>
                {" "}
                · <span className="font-mono">{who.number}</span>
              </>
            ) : null}
          </span>
        }
        backHref="/patient/menu"
        backLabel="Back to More"
      />

      {res.blocked === "no_consent" || !consent ? (
        <section className={card}>
          <h2 className="text-heading-s">Results in the app</h2>
          <p className="text-body-s">
            Results show here only if you agree. Nothing is shown until then.
          </p>
          <ResultsConsentSwitch on={consent} subject={subject} label={LAB5.consent} />
        </section>
      ) : res.blocked === "minor" ? (
        <p className={`${card} text-body-s`}>
          Results for children and young people are not shown in the app yet. Ask at the hospital.
        </p>
      ) : res.blocked === "rules_unsigned" ? (
        <p className={`${card} text-body-s`}>
          Your hospital has not started showing results in the app yet.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="ready">
            <h2 id="ready" className="text-heading-s">
              Ready
            </h2>
            {res.ready.length === 0 ? (
              <p className="text-body-s text-muted-foreground">No results yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {res.ready.map((c) => (
                  <li key={c.reportId}>
                    <Link
                      href={`/patient/results/${c.reportId}${q}`}
                      className={`${card} hover:bg-muted focus-visible:ring-ring outline-none focus-visible:ring-2`}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-body font-medium">{c.test}</span>
                        <span className="text-caption text-muted-foreground font-mono">
                          {c.releasedOn}
                        </span>
                      </span>
                      {c.beingChecked ? (
                        <span className="text-body-s">{LAB5.beingChecked}</span>
                      ) : (
                        c.values.slice(0, 3).map((v) => (
                          <span key={v.name} className="text-body-s">
                            {c.values.length > 1 ? `${v.name}: ` : ""}
                            <span className="font-mono tabular-nums">
                              {v.value} {v.unit}
                            </span>{" "}
                            · {WORD[v.word]}
                          </span>
                        ))
                      )}
                      {c.correctedOn ? (
                        <span className="text-caption">
                          {fill(LAB5.corrected, { date: c.correctedOn })}
                        </span>
                      ) : null}
                      {c.note ? <span className="text-body-s">{c.note}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {res.notReady.length ? (
            <section className="flex flex-col gap-3" aria-labelledby="not-ready">
              <h2 id="not-ready" className="text-heading-s">
                {LAB5.notReadyHeld}
              </h2>
              <ul className="flex flex-col gap-2">
                {res.notReady.map((n) => (
                  <li key={n.key} className={card}>
                    <span className="text-body font-medium">{n.test}</span>
                    <span className="text-body-s">{n.line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="text-body-s text-muted-foreground">{LAB5.inPerson}</p>
        </>
      )}

      <section className={card} aria-labelledby="choices">
        <h2 id="choices" className="text-heading-s">
          Your choices
        </h2>
        {consent ? (
          <ResultsConsentSwitch on={consent} subject={subject} label={LAB5.consent} />
        ) : null}
        {sms && consent ? (
          <ResultsConsentSwitch
            on={smsOn}
            subject={subject}
            type="results_sms"
            label={`Text me when results are ready${mine?.phone ? ` (${mine.phone})` : ""}`}
          />
        ) : null}
        <p className="text-body-s">
          Who else can see these results: links for parents and guardians are made at the hospital,
          never in the app.
        </p>
        {!forChild ? <AskForCopy /> : null}
        {children.length ? (
          <nav aria-label="Children" className="flex flex-col gap-1">
            {forChild ? (
              <Link href="/patient/results" className="text-body-s underline">
                My own results
              </Link>
            ) : null}
            {children
              .filter((c) => c.id !== subject)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/patient/results?for=${c.id}`}
                  className="text-body-s underline"
                >
                  Results for my {c.relationship.replace(/_/g, " ")}
                </Link>
              ))}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
