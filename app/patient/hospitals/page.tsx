import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  HospitalIcon,
  MapPinIcon,
  SearchIcon,
  TicketIcon,
} from "lucide-react";

import { HOSPITAL_LEVEL_LABEL, listDirectoryHospitals } from "@/lib/patient/hospitals";
import { requirePatientScope } from "@/lib/patient/scope";
import { SelectHospitalButton } from "./_components/select-hospital-button";

export const metadata: Metadata = { title: "Hospitals · MedSync" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PatientHospitalsPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const scope = await requirePatientScope();
  const search = (q ?? "").trim();
  const results = await listDirectoryHospitals({ search });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <Link
        href="/patient"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        Back to home
      </Link>

      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          MedSync · Hospitals
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          {scope.primaryHospitalId ? "Hospitals on MedSync" : "Find your hospital"}
        </h1>
        <p className="text-muted-foreground max-w-[44ch] text-[13px] leading-relaxed">
          {scope.primaryHospitalId
            ? "Browse the network — switch your primary if you'd like, or just check who's here."
            : "Pick one as your primary hospital. You can change it any time."}
        </p>
      </header>

      {/* ── Search ─────────────────────────────────────────────── */}
      <form className="relative" role="search" action="/patient/hospitals">
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        >
          <SearchIcon className="size-4" />
        </span>
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by name, district, or region"
          className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring h-10 w-full rounded-lg border pr-3 pl-9 text-[13px] shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
        />
      </form>

      {/* ── Results ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
            {search ? "Matches" : "Active hospitals"}
          </h2>
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            {results.length} {results.length === 1 ? "result" : "results"}
          </span>
        </div>

        {results.length === 0 ? (
          <p className="text-muted-foreground border-border bg-card rounded-xl border p-4 text-[12.5px] leading-relaxed">
            {search
              ? `No hospitals match "${search}". Try a shorter query, or clear the search.`
              : "No active hospitals are listed right now. Check back soon."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((h) => {
              const isPrimary = h.id === scope.primaryHospitalId;
              return (
                <li
                  key={h.id}
                  className={
                    isPrimary
                      ? "rounded-xl border border-teal-500/40 bg-teal-50/40 p-4 dark:border-teal-400/30 dark:bg-teal-950/20"
                      : "border-border bg-card rounded-xl border p-4"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        aria-hidden
                        className={
                          isPrimary
                            ? "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-900/40 dark:text-teal-300 dark:ring-teal-800/40"
                            : "bg-muted text-foreground/80 inline-flex size-9 shrink-0 items-center justify-center rounded-full"
                        }
                      >
                        <HospitalIcon className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-foreground truncate text-[14px] font-medium">
                          {h.name}
                        </span>
                        <span className="text-muted-foreground text-[12px]">
                          {HOSPITAL_LEVEL_LABEL[h.level] ?? h.level}
                          {h.departmentCount > 0
                            ? ` · ${h.departmentCount} department${h.departmentCount === 1 ? "" : "s"}`
                            : ""}
                        </span>
                        {(h.district ?? h.region) ? (
                          <span className="text-muted-foreground/80 inline-flex items-center gap-1 text-[11.5px]">
                            <MapPinIcon className="size-3" aria-hidden />
                            {[h.district, h.region].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <SelectHospitalButton hospitalId={h.id} isPrimary={isPrimary} />
                  </div>
                  {isPrimary ? (
                    <div className="mt-3 flex flex-col gap-2.5 border-t border-teal-500/20 pt-3 dark:border-teal-400/20">
                      <p className="text-muted-foreground text-[11.5px] leading-snug">
                        What would you like to do?
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <Link
                          href="/patient/queue"
                          className="border-border bg-card inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-medium text-teal-700 transition-colors hover:border-teal-300 hover:bg-teal-50/30 dark:text-teal-300 dark:hover:bg-teal-50/5"
                        >
                          <TicketIcon className="size-3.5" aria-hidden />
                          Join today&rsquo;s queue
                        </Link>
                        <Link
                          href="/patient/book"
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-teal-600 px-3 py-2 text-[12.5px] font-medium text-white shadow-xs transition-colors hover:bg-teal-700"
                        >
                          <CalendarPlusIcon className="size-3.5" aria-hidden />
                          Book a future visit
                        </Link>
                      </div>
                      <Link
                        href="/patient"
                        className="text-muted-foreground hover:text-foreground self-center text-[11.5px] transition-colors"
                      >
                        Not now — back to home
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
