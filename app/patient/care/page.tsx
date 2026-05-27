import type { Metadata } from "next";
import Link from "next/link";
import { BuildingIcon } from "lucide-react";

import { requirePatientScope } from "@/lib/patient/scope";
import { PatientPlaceholderScreen } from "../_components/placeholder-screen";

export const metadata: Metadata = { title: "My care · MedSync" };
export const dynamic = "force-dynamic";

/**
 * "My care" — the surface that, when connected to a hospital, will
 * show the clinical view (records, prescribed monitoring, care-team).
 * Today it's a calm, inviting placeholder.
 */
export default async function PatientCarePage() {
  const scope = await requirePatientScope();

  if (!scope.primaryHospitalId) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
        <Link
          href="/patient/menu"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
        >
          ← Back to More
        </Link>

        <header className="flex flex-col gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
            <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
            MedSync · My care
          </span>
          <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
            Available once you connect
          </h1>
        </header>

        <div className="relative overflow-hidden rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-50/80 via-teal-50/40 to-transparent p-5 dark:border-teal-400/20 dark:from-teal-950/30 dark:via-teal-950/15 dark:to-transparent">
          <div
            aria-hidden
            className="absolute -top-12 -right-12 size-32 rounded-full bg-teal-500/10 blur-2xl dark:bg-teal-400/10"
          />
          <div className="relative flex items-start gap-3">
            <span
              aria-hidden
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800/40"
            >
              <BuildingIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="font-display text-foreground text-[16px] font-medium tracking-[-0.005em]">
                Your clinical view lives here
              </span>
              <p className="text-muted-foreground max-w-[44ch] text-[12.5px] leading-relaxed">
                When you choose a primary hospital and a clinician connects with you, this is where
                your records, prescribed monitoring, and care-team messages will appear.
              </p>
              <Link
                href="/patient/hospitals"
                className="mt-1 inline-flex w-fit items-center gap-1 text-[12px] font-medium text-teal-700 dark:text-teal-300"
              >
                Pick a hospital →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PatientPlaceholderScreen
      eyebrow="MedSync · My care"
      title={scope.primaryHospitalName ?? "Your care"}
      blurb="Your clinical view — coming with the clinical module. Today, your self-tracking on the Track tab stays private to you."
      Icon={BuildingIcon}
      backHref="/patient/menu"
      backLabel="Back to More"
      upcoming={[
        "Encounter summaries (the read-side seam exists in scheduling)",
        "Clinician-prescribed monitoring — separate from your self-tracking",
        "Care-team messages",
        "Prescriptions & lab results when the clinical module ships",
      ]}
    />
  );
}
