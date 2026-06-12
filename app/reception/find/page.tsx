import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { searchPatientsByCode } from "@/lib/reception/queries";
import { requireReceptionScope } from "@/lib/reception/scope";

export const metadata: Metadata = { title: "Find · Reception · MedSync" };
export const dynamic = "force-dynamic";

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  intersex: "Intersex",
  prefer_not_say: "Prefer not to say",
};

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ReceptionFindPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const scope = await requireReceptionScope();
  const query = (q ?? "").trim();

  const hits =
    query.length >= 3
      ? await searchPatientsByCode({ hospitalId: scope.hospitalId, query, limit: 20 })
      : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:py-10">
      <Link
        href="/reception"
        className="text-muted-foreground hover:text-foreground group reveal-up inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon
          className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
          aria-hidden
        />
        Today
      </Link>

      <header className="reveal-up flex flex-col gap-2" style={{ animationDelay: "50ms" }}>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Find a patient
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em]">
          Search by patient code
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          The fast lookup. Name + phone search lands with the audited operational-decrypt path in a
          follow-up — for now the patient code is what reception types.
        </p>
      </header>

      <form
        className="group reveal-up relative rounded-md transition-shadow duration-200 focus-within:shadow-[0_0_0_4px_rgba(20,184,166,0.08)]"
        style={{ animationDelay: "100ms" }}
        role="search"
        action="/reception/find"
      >
        <span
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 transition-colors duration-200 group-focus-within:text-teal-600 dark:group-focus-within:text-teal-400"
        >
          <SearchIcon className="size-4" />
        </span>
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="e.g. MS-2026-00"
          className="h-10 w-full pr-3 pl-9 font-mono text-[13px]"
          minLength={3}
          autoFocus
        />
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          {query.length < 3
            ? "Type ≥ 3 characters"
            : `${hits.length} ${hits.length === 1 ? "match" : "matches"}`}
        </h2>

        {query.length >= 3 && hits.length === 0 ? (
          <div className="border-border bg-card reveal-up flex items-center gap-4 rounded-xl border p-4">
            <svg viewBox="0 0 64 64" aria-hidden className="text-border h-10 w-10 shrink-0">
              <circle
                cx="27"
                cy="27"
                r="16"
                stroke="currentColor"
                strokeWidth="5"
                fill="none"
                opacity="0.5"
              />
              <path
                d="M39 39l14 14"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.35"
              />
              <circle cx="27" cy="27" r="3" className="text-teal-500/30" fill="currentColor" />
            </svg>
            <p className="text-muted-foreground text-[12.5px]">
              No patient matches &ldquo;{query}&rdquo;. If they&rsquo;re new, head to{" "}
              <Link
                href="/reception/intake"
                className="text-foreground underline-offset-2 hover:underline"
              >
                Register an entry
              </Link>{" "}
              and choose a walk-in / referral type.
            </p>
          </div>
        ) : null}

        {hits.length > 0 ? (
          /* key re-runs the cascade on every new query */
          <ul key={query} className="stagger-children flex flex-col gap-2">
            {hits.map((h) => (
              <li
                key={h.patientUserId}
                className="border-border bg-card card-lift flex items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground font-mono text-[14px] font-medium tabular-nums">
                    {h.patientCode}
                  </span>
                  <span className="text-muted-foreground text-[12px]">
                    {SEX_LABEL[h.sex] ?? h.sex} · {computeAge(h.dateOfBirth)}y
                    {h.primaryHospitalName ? ` · primary: ${h.primaryHospitalName}` : ""}
                  </span>
                </div>
                <Link
                  href={`/reception/intake?patient=${h.patientUserId}`}
                  className="text-foreground border-foreground/15 hover:border-foreground/30 hover:bg-muted/40 tap group/cta inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] whitespace-nowrap transition-colors"
                >
                  Register an entry
                  <span
                    aria-hidden
                    className="inline-block transition-transform duration-200 group-hover/cta:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function computeAge(iso: string): number {
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
