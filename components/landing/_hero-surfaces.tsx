import { MyHealthMock } from "./_my-health-mock";
import { ClinicianHomeMock } from "./05-clinician-home-mock";

/**
 * Hero surfaces composition — the clinician dashboard + the patient phone,
 * visible together so the hero communicates "two ends of one loop" at a
 * glance (addendum Edit 1).
 *
 * Doesn't touch either mock file. Wraps the existing ClinicianHomeMock
 * and adds the MyHealthMock alongside:
 *   - lg+: phone overlaps the bottom-right corner of the clinician
 *     section, scaled to ~75% so the clinician dashboard stays the
 *     dominant surface and the phone reads as the patient-end companion.
 *   - <lg: phone stacks centred below the dashboard with a small
 *     negative top-margin so it visually belongs to the same hero block.
 *
 * Section padding and bottom margin are added explicitly here so the
 * overlap doesn't push the page composition; nothing downstream needs to
 * compensate.
 */

export function HeroSurfaces() {
  return (
    <div className="relative">
      <ClinicianHomeMock />

      {/* Patient phone — overlay at lg+, anchored to the bottom-right of
          the same content max-width as the clinician mock so it sits at a
          predictable position regardless of viewport width. */}
      <div className="pointer-events-none absolute inset-0 z-10 hidden lg:block">
        <div className="mx-auto h-full max-w-300 px-3 sm:px-8">
          <div className="relative h-full">
            <div className="absolute right-2 bottom-0 origin-bottom-right scale-[0.78]">
              <MyHealthMock fragment="full" />
            </div>
          </div>
        </div>
      </div>

      {/* Patient phone — stacked below on mobile + tablet. The negative
          margin pulls it up into the clinician section's bottom padding
          so the two surfaces visually belong to one hero. */}
      <div className="-mt-10 flex justify-center px-5 pb-16 lg:hidden">
        <MyHealthMock fragment="full" />
      </div>
    </div>
  );
}
