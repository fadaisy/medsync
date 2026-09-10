import {
  MyHealthAdherenceStrip,
  MyHealthLogReadingCard,
  MyHealthReassuranceLine,
  MyHealthReportConcernCard,
  MyHealthSmsReminderChip,
  MyHealthTodayMedsCard,
} from "./_my-health-mock";
import { ClinicianHomeMock } from "./clinician-home-mock";

/**
 * Hero surfaces composition — the clinician dashboard + the patient
 * cards, visible together so the hero communicates "two ends of one
 * loop" at a glance (addendum Edit 1).
 *
 * Doesn't touch ClinicianHomeMock. Renders it at full width, then below
 * lays out the patient cards as a horizontal band that fills the same
 * content width — no more empty space at the sides.
 *
 * Layout:
 *   - lg+ : 4-column grid of patient cards (LogReading · TodayMeds ·
 *           Adherence+SMS column · ReportConcern+Reassurance column).
 *   - md  : 2-column grid (2x2).
 *   - <md : single stacked column.
 *
 * A connecting band ("… and on Amina's app at home") sits between the
 * clinician dashboard and the patient strip so the two reads as one
 * hero — not two unrelated sections.
 */

export function HeroSurfaces() {
  return (
    <>
      <ClinicianHomeMock />

      <div className="bg-background mx-auto -mt-10 flex w-full max-w-300 flex-col gap-5 px-5 pb-20 sm:px-8 sm:pb-24 lg:-mt-16">
        {/* Connecting band — full-width hairline + label.
            Visually links the dashboard above to the patient cards
            below so the reader sees one loop, not two surfaces. */}
        <div
          className="motion-safe:reveal-up flex items-center gap-3"
          style={{ animationDelay: "720ms" }}
        >
          <span className="bg-border h-px flex-1" aria-hidden />
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="pulse-dot bg-brand-500 size-1 rounded-full" />
            &hellip; and on Amina&rsquo;s app at home
          </span>
          <span className="bg-border h-px flex-1" aria-hidden />
        </div>

        {/* Patient cards — horizontal grid at lg+, 2x2 at md, stack at <md.
            Cards are the same primitives used in §07b patient chapter,
            §10a / §12a weaves, and the MyHealthMock fragments. Each column
            drifts on a slow phase-shifted float at lg+ so the band reads
            as cards hovering at the patient's end of the loop. */}
        <ul
          role="list"
          className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-start"
        >
          <li>
            <div className="lg:float-slow">
              <MyHealthLogReadingCard />
            </div>
          </li>
          <li>
            <div className="lg:float-slow" style={{ animationDelay: "-1.4s" }}>
              <MyHealthTodayMedsCard />
            </div>
          </li>
          <li>
            <div className="lg:float-slow flex flex-col gap-3" style={{ animationDelay: "-2.8s" }}>
              <MyHealthAdherenceStrip />
              <MyHealthSmsReminderChip />
            </div>
          </li>
          <li>
            <div className="lg:float-slow flex flex-col gap-3" style={{ animationDelay: "-0.9s" }}>
              <MyHealthReportConcernCard />
              <MyHealthReassuranceLine />
            </div>
          </li>
        </ul>
      </div>
    </>
  );
}
