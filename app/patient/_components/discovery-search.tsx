"use client";

import type { ServiceLineCard as Line, ProviderCard as Provider } from "@/lib/patient/discover";
import { useId, useState } from "react";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ProviderCard } from "./provider-card";
import { SectionHead } from "./section-head";
import { ServiceLineCard } from "./service-line-card";

/**
 * The reference's "Let's find your doctor": one search box over the
 * clinician carousel and the clinic grid. It filters what the page already
 * holds — a name, a department, a specialty, a clinic — so a match is always
 * something the patient could open; nothing is fetched to flatter a query.
 * The box sits above both lists rather than between them (the reference's
 * order) because a filter must not act on something scrolled out of view.
 * Same component, same name, on the phone.
 */
export function DiscoverySearch({ lines, providers }: { lines: Line[]; providers: Provider[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const q = query.trim().toLowerCase();
  const hit = (...parts: (string | null | undefined)[]) =>
    q === "" || parts.some((p) => p?.toLowerCase().includes(q));

  const shownProviders = providers.filter((p) => hit(p.fullName, p.departmentName)).slice(0, 8);
  const shownLines = lines.filter((l) => hit(l.name, l.departmentName)).slice(0, 4);
  const emphasis = soonestLineId(shownLines);

  if (lines.length === 0 && providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="find-doctor" className="flex flex-col gap-3">
        <SectionHead
          id="find-doctor"
          title="Let's find your doctor"
          linkHref="/patient/book"
          linkLabel="Book a visit"
        />
        <label htmlFor={inputId} className="sr-only">
          Search clinicians and clinics by name or department
        </label>
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
          />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A clinician, a department, a clinic"
            autoComplete="off"
            className="min-h-11 rounded-xl pl-10"
          />
        </div>
        {/* Announced, not just drawn: a screen reader hears the count change. */}
        <p aria-live="polite" className="text-muted-foreground text-caption">
          {q === ""
            ? null
            : `${shownProviders.length} ${shownProviders.length === 1 ? "clinician" : "clinicians"} and ${shownLines.length} ${shownLines.length === 1 ? "clinic" : "clinics"} match`}
        </p>
      </section>

      {shownProviders.length > 0 ? (
        <section aria-labelledby="your-clinicians" className="flex flex-col gap-3">
          <SectionHead
            id="your-clinicians"
            title="Your clinicians"
            linkHref="/patient/book"
            linkLabel="See all"
          />
          {/* A scroller, not a grid: the reference's carousel, and on a
              narrow phone it keeps the first card whole rather than
              shrinking four into a row nobody can read. */}
          <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
            {shownProviders.map((p) => (
              <li key={p.userId} className="snap-start">
                <ProviderCard provider={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shownLines.length > 0 ? (
        <section aria-labelledby="find-care" className="flex flex-col gap-3">
          <SectionHead
            id="find-care"
            title="Find care"
            linkHref="/patient/book"
            linkLabel="Book a visit"
          />
          {/* The one filled tile is the clinic open soonest — emphasis
              carrying a fact, not a decoration. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {shownLines.map((line) => (
              <ServiceLineCard key={line.id} line={line} emphasis={line.id === emphasis} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function soonestLineId(lines: ReadonlyArray<Line>): string | null {
  const open = lines.filter((l) => l.soonest !== null);
  if (open.length === 0) return null;
  return open.reduce((best, l) =>
    (l.soonest as { dateKey: string }).dateKey < (best.soonest as { dateKey: string }).dateKey
      ? l
      : best,
  ).id;
}
