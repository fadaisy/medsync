import { MyHealthMock } from "./_my-health-mock";
import { ClinicianHomeMock } from "./05-clinician-home-mock";

/**
 * Hero surfaces composition — the clinician dashboard + the patient
 * cards, visible together so the hero communicates "two ends of one
 * loop" at a glance (addendum Edit 1).
 *
 * Doesn't touch ClinicianHomeMock. Renders it at full width, then
 * tucks the MyHealthMock into the hero section's bottom space:
 *   - lg+: right-aligned in the same content max-width as the
 *     clinician section, with a small "and on Amina's app" label
 *     above so the relationship reads at a glance.
 *   - <lg: centred below the dashboard.
 *
 * A negative top margin pulls the patient column up into the
 * clinician section's bottom padding so the two read as one hero
 * block, not two unrelated sections.
 */

export function HeroSurfaces() {
  return (
    <>
      <ClinicianHomeMock />
      <div className="bg-background mx-auto -mt-10 flex w-full max-w-300 flex-col items-center gap-3 px-5 pb-20 sm:px-8 sm:pb-24 lg:-mt-16 lg:items-end">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="bg-border h-px w-6" />
          &hellip; and on Amina&rsquo;s app at home
        </span>
        <MyHealthMock fragment="full" />
      </div>
    </>
  );
}
