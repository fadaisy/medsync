import type { Metadata } from "next";

import { Pill } from "@/components/ui/pill";
import { requirePatientScope } from "@/lib/patient/scope";
import { listVisitSummaries } from "@/lib/patient/visit-summaries";
import { PatientPageHeader } from "../_components/page-header";
import { TintedRow } from "../_components/tinted-row";

export const metadata: Metadata = { title: "My care · MedSync" };
export const dynamic = "force-dynamic";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

const SUMMARY_COMING = "A summary after each visit";
/** What will land here when the clinical module ships — patient words, not ours. */
const COMING_NEXT = [
  SUMMARY_COMING,
  "Monitoring your clinician asks you to do",
  "Messages from your care team",
  "Prescriptions and lab results",
] as const;

/**
 * "My care" is an empty room, and this page says so in one layout rather
 * than the two it used to branch between. Nothing a hospital records
 * reaches a patient yet, so the only honest content is the two things that
 * *are* live — the directory and self-tracking — and a plain list of what
 * is coming. It is deliberately small: §B.4 is why it lost its tab.
 * Visit summaries a clinician shared (ADR 0203) are the first hospital
 * record to arrive; they list here only when there is one.
 */
export default async function PatientCarePage() {
  const scope = await requirePatientScope();
  const connected = Boolean(scope.primaryHospitalId);
  const visits = await listVisitSummaries(scope.userId);
  const comingNext = visits.length
    ? COMING_NEXT.filter((item) => item !== SUMMARY_COMING)
    : COMING_NEXT;

  return (
    <div className="stagger-children flex flex-col gap-6">
      <PatientPageHeader
        eyebrow="MedSync · My care"
        title="My care"
        description={
          visits.length
            ? "Summaries of your visits that your care team shared with you. Nothing else from a hospital reaches this page yet."
            : connected
              ? `Nothing from ${scope.primaryHospitalName ?? "your hospital"} reaches this page yet — the clinical module hasn't shipped. When it does, it lands here.`
              : "This is where your hospital's side of things will appear. It fills up once you connect to a hospital."
        }
        backHref="/patient/menu"
        backLabel="Back to More"
      />

      {visits.length ? (
        <section aria-labelledby="your-visits" className="flex flex-col gap-3">
          <h2 id="your-visits" className="text-heading-s">
            Your visits
          </h2>
          <ul className="stagger-children flex flex-col gap-2">
            {visits.map((v) => (
              <TintedRow
                key={v.id}
                tint="brand"
                iconKey="hospital"
                title={`${DATE_FMT.format(v.decidedAt)} · ${v.hospitalName}`}
                subtitle={v.outcome}
                href={`/patient/care/visits/${v.id}`}
                trailing={v.updated ? <Pill tone="info">Updated</Pill> : undefined}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="stagger-children flex flex-col gap-2">
        {connected ? null : (
          <TintedRow
            tint="brand"
            iconKey="hospital"
            title="Find your hospital"
            subtitle="Pick a primary hospital to get started"
            href="/patient/hospitals"
          />
        )}
        <TintedRow
          tint="mint"
          iconKey="activity"
          title="Your self-tracking"
          subtitle="Readings and doses you record — private to you"
          href="/patient/track"
        />
      </ul>

      <section className="bg-card dark:shadow-card flex flex-col gap-3 rounded-xl p-5 shadow-xs">
        <h2 className="text-heading-s">Coming next</h2>
        <p className="text-muted-foreground text-body-s max-w-[60ch] leading-relaxed">
          None of this is built yet. It is listed so you know what this page is for, not so it looks
          busy.
        </p>
        <ul className="flex flex-col gap-1.5">
          {comingNext.map((item) => (
            <li
              key={item}
              className="text-muted-foreground text-body-s flex items-start gap-2 leading-relaxed"
            >
              <span
                aria-hidden
                className="bg-brand-500/70 mt-2 inline-block size-1 shrink-0 rounded-full"
              />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
