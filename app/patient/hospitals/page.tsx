import type { DirectoryHospital } from "@/lib/patient/hospitals";
import type { Metadata } from "next";
import Link from "next/link";
import { HospitalIcon, MapPinIcon, SearchIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { DataTableEmpty, Pill } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { HOSPITAL_LEVEL_LABEL, listDirectoryHospitals } from "@/lib/patient/hospitals";
import { requirePatientScope } from "@/lib/patient/scope";
import { cn } from "@/lib/utils";
import { PatientDoors } from "../_components/doors";
import { EmergencyNotice } from "../_components/emergency-notice";
import { PatientPageHeader } from "../_components/page-header";
import { SelectHospitalButton } from "./_components/select-hospital-button";

export const metadata: Metadata = { title: "Hospitals · MedSync" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Region is the only geography a patient can act on — a district name means
 * nothing without one, and the directory is national. Grouping by it turns a
 * flat 60-row list into "is mine here?", which is the only question this page
 * is asked. Rows already arrive name-ascending, so the groups inherit that.
 */
function groupByRegion(rows: DirectoryHospital[]): Array<[string, DirectoryHospital[]]> {
  const groups = new Map<string, DirectoryHospital[]>();
  for (const row of rows) {
    const key = row.region ?? "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  // The unnamed bucket sorts last: it is an absence, not a place.
  return [...groups.entries()].sort(([a], [b]) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
  );
}

export default async function PatientHospitalsPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const scope = await requirePatientScope();
  const search = (q ?? "").trim();
  const results = await listDirectoryHospitals({ search });
  const groups = groupByRegion(results);
  // Names the emergency landmark when there is a hospital to name, and gates
  // the doors on the primary-hospital card below. The fallback only fires if
  // the hospital row behind an affiliation has gone — the name never reaches
  // the emergency copy itself (ADR 0084 §3).
  const hospitalName = scope.primaryHospitalId
    ? (scope.primaryHospitalName ?? "Your hospital")
    : null;

  return (
    <div className="stagger-children flex flex-col gap-6">
      <PatientPageHeader
        eyebrow="MedSync · Hospitals"
        title={scope.primaryHospitalId ? "Hospitals on MedSync" : "Find your hospital"}
        description={
          scope.primaryHospitalId
            ? "Browse the network — switch your primary hospital if you'd like, or just see who's here."
            : "Pick one as your primary hospital. You can change it any time."
        }
        backHref="/patient"
        backLabel="Back to home"
      />

      {/* First thing on the screen, above the doors further down this page —
          not beside them (ADR 0084 §3). A patient browsing the directory may
          be the one who should not be browsing anything.

          Unconditional, and the argument is stronger here than on `/patient`:
          this page's own header switches to "Find your hospital" for a patient
          with no affiliation, so the unaffiliated patient is not an edge case
          on this surface — they are its audience. Gating the instruction on a
          primary hospital would hide it from exactly the people the page was
          built for, while they browse rather than travel. With no hospital
          there is no verified number either, so the block shows the
          destination alone. */}
      <EmergencyNotice hospitalName={hospitalName} emergencyPhone={scope.emergencyEntrancePhone} />

      {/* Native GET form: search survives a reload, a shared link and no JS. */}
      <form role="search" action="/patient/hospitals" className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            name="q"
            defaultValue={search}
            aria-label="Search hospitals"
            placeholder="Search by name, district, or region"
            className="h-11 rounded-full pl-10"
          />
        </div>
        {search ? (
          <Link
            href="/patient/hospitals"
            className="text-muted-foreground hover:text-foreground text-body-s duration-fast ease-expo-out inline-flex min-h-11 shrink-0 items-center rounded-md px-3 transition-colors"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <section className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-heading-s font-medium">{search ? "Matches" : "All hospitals"}</h2>
          <span className="text-muted-foreground text-body-s tabular font-mono">
            {results.length} {results.length === 1 ? "result" : "results"}
          </span>
        </div>

        {results.length === 0 ? (
          <div className="bg-card dark:shadow-card rounded-xl p-6 shadow-xs">
            <DataTableEmpty
              title={search ? `No hospitals match “${search}”` : "No hospitals listed yet"}
              description={
                search
                  ? "Try a shorter search — a district or a region works too."
                  : "No hospital in the network is accepting patients right now. Check back soon."
              }
              action={
                search ? (
                  <Link
                    href="/patient/hospitals"
                    className={buttonVariants({ variant: "secondary", size: "lg" })}
                  >
                    Clear search
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          groups.map(([region, rows]) => (
            <div key={region || "unlisted"} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-body-m text-muted-foreground font-medium">
                  {region || "Region not listed"}
                </h3>
                <span className="text-muted-foreground text-caption tabular font-mono">
                  {rows.length}
                </span>
              </div>

              <ul className="stagger-children grid gap-2 @3xl/page:grid-cols-2">
                {rows.map((h) => {
                  const isPrimary = h.id === scope.primaryHospitalId;
                  const place = [h.district, h.region].filter(Boolean).join(", ");
                  return (
                    <li
                      key={h.id}
                      className={cn(
                        "bg-card dark:shadow-card flex flex-col gap-3 rounded-xl p-4 shadow-xs",
                        isPrimary && "bg-accent ring-brand-300 shadow-none ring-1 dark:shadow-none",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="bg-brand-100 text-brand-800 grid size-11 shrink-0 place-items-center rounded-xl"
                        >
                          <HospitalIcon strokeWidth={1.5} className="size-5" />
                        </span>

                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h4 className="text-foreground text-body-m font-medium">{h.name}</h4>
                            {isPrimary ? (
                              // Keyed on the primary id so the flare replays when
                              // the choice changes — never by remounting the row.
                              <Pill
                                key={scope.primaryHospitalId ?? "none"}
                                tone="stable"
                                className="select-flare"
                              >
                                Your hospital
                              </Pill>
                            ) : null}
                          </div>

                          <p className="text-muted-foreground text-body-s">
                            {HOSPITAL_LEVEL_LABEL[h.level] ?? h.level}
                          </p>

                          {place ? (
                            <p className="text-muted-foreground text-body-s inline-flex items-center gap-1">
                              <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
                              {place}
                            </p>
                          ) : null}

                          {h.departmentCount > 0 ? (
                            <p className="text-muted-foreground text-body-s tabular font-mono">
                              {h.departmentCount}{" "}
                              {h.departmentCount === 1 ? "department" : "departments"}
                            </p>
                          ) : null}
                        </div>

                        {/* The primary row says so with its own pill; a second
                            "Your primary" chip here would say it twice. */}
                        {isPrimary ? null : <SelectHospitalButton hospitalId={h.id} />}
                      </div>

                      {/* Two equal-width buttons with booking as the primary
                          one: the asymmetry ran the wrong way, and equal
                          weight would have been wrong too (ADR 0084 §1a). The
                          ratified pair replaces both, so the words, the
                          ordering and the missing icons are decided in one
                          place rather than per surface. */}
                      {isPrimary ? (
                        <div className="border-brand-300/60 border-t pt-3">
                          <PatientDoors />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
