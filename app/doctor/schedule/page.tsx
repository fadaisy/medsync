import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRightIcon, CalendarClockIcon } from "lucide-react";

import { requireDoctorScope } from "@/lib/doctor/scope";

export const metadata: Metadata = { title: "Schedule · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Doctor schedule — for now a directional landing that hands off to
 * the existing /clinician/schedule + /clinician/availability surfaces
 * (which were built in scheduling GATE B and serve every clinical
 * cadre). A polish pass will move the schedule view under /doctor
 * once the cadre-specific extensions (specialty clinic templates,
 * urgent-from-alert badges) are designed.
 */
export default async function DoctorSchedulePage() {
  await requireDoctorScope();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Schedule
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em]">
          Your day
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          Schedule + availability live under the shared{" "}
          <span className="font-mono">/clinician</span> shell today (every clinical cadre uses the
          same scheduling surfaces). A doctor-tailored view (specialty templates, urgent-from-alert
          badges) lands as a polish pass.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        <DeepLink
          href="/clinician/schedule"
          title="Today + upcoming"
          subtitle="Appointments, arrivals, urgent items"
        />
        <DeepLink
          href="/clinician/availability"
          title="Availability"
          subtitle="Bookable blocks, leave, recurring sessions"
        />
      </div>
    </div>
  );
}

function DeepLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="border-border bg-card hover:bg-muted/30 hover:border-foreground/15 group flex items-start gap-3 rounded-xl border p-5 transition-colors"
    >
      <span
        aria-hidden
        className="bg-muted text-foreground/80 inline-flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <CalendarClockIcon className="size-4" />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-foreground inline-flex items-center gap-1 text-[14px] font-medium">
          {title}
          <ArrowUpRightIcon
            className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden
          />
        </span>
        <span className="text-muted-foreground text-[12px]">{subtitle}</span>
      </span>
    </Link>
  );
}
