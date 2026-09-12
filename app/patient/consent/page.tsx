import type { Metadata } from "next";

import { requirePatientScope } from "@/lib/patient/scope";
import { PatientPageHeader } from "../_components/page-header";
import { TintedRow } from "../_components/tinted-row";

export const metadata: Metadata = { title: "Consent & sharing · MedSync" };
export const dynamic = "force-dynamic";

/** What will land here when sharing ships — patient words, not ours. */
const COMING_NEXT = [
  "Your primary hospital, and what they can access",
  "Per-clinician access, granted through your visits",
  "Caregiver invitations — share with family if you choose",
  "Revoke any of the above, with the full history in your audit log",
] as const;

/**
 * Consent is an empty room, and it says so — same shape as My care and
 * Settings, because three pages describing three unbuilt things should not
 * look like three different products.
 *
 * It used to render `PatientPlaceholderScreen`, which carried its own page
 * gutters (doubled inside the layout's wrapper) and a decorative blur blob.
 * That component had one caller left; this page is what replaced it.
 */
export default async function PatientConsentPage() {
  await requirePatientScope();

  return (
    <div className="stagger-children flex flex-col gap-6">
      <PatientPageHeader
        eyebrow="MedSync · Consent"
        title="Consent & sharing"
        description="A single place to see who can see what — your hospital, individual clinicians, and any caregivers you grant access to. None of it is built yet."
        backHref="/patient/menu"
        backLabel="Back to More"
      />

      <ul className="stagger-children flex flex-col gap-2">
        {/* The one true statement this page can make today. */}
        <TintedRow
          tint="mint"
          iconKey="activity"
          title="Your self-tracking is private"
          subtitle="Readings and doses you record are visible to you alone"
          href="/patient/track"
        />
      </ul>

      <section className="bg-card dark:shadow-card flex flex-col gap-3 rounded-xl p-5 shadow-xs">
        <h2 className="text-heading-s font-medium">Coming next</h2>
        <p className="text-muted-foreground text-body-s max-w-[60ch] leading-relaxed">
          None of this is built yet. It is listed so you know what this page is for, not so it looks
          busy.
        </p>
        <ul className="flex flex-col gap-1.5">
          {COMING_NEXT.map((item) => (
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
