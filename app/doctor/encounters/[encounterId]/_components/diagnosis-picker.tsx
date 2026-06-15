"use client";

import type { CatalogSearchResult } from "@/lib/clerkship/diagnosis/search";
import { useMemo, useState } from "react";
import { AlertTriangleIcon, SearchIcon } from "lucide-react";

import { searchCatalog } from "@/lib/clerkship/diagnosis/search";
import { cn } from "@/lib/utils";

/**
 * "Select a diagnosis from the catalog" — a searchable picker over the diagnosis
 * catalog (NCDs surfaced first, then the maps-derived acute differentials).
 * Decision-support: a selection becomes the clinician's working diagnosis via the
 * SAME differential commit path as a ranked suggestion (never a second record).
 * The NCD catalog is gated dark until CSO sign-off, so until then this searches
 * only the signed acute catalog.
 */
export function DiagnosisPicker({ onPick }: { onPick: (r: CatalogSearchResult) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchCatalog(query), [query]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="border-input bg-card focus-within:ring-ring/25 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 focus-within:border-teal-500 focus-within:ring-2">
        <SearchIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the diagnosis catalog (name or ICD-10)…"
          className="text-foreground placeholder:text-muted-foreground/70 w-full bg-transparent text-[12.5px] outline-none"
          aria-label="Search the diagnosis catalog"
        />
      </div>

      {query.trim().length >= 2 ? (
        results.length ? (
          <ul
            aria-label="Diagnosis catalog results"
            className="border-border bg-card flex max-h-64 flex-col gap-0.5 overflow-auto rounded-lg border p-1 shadow-sm"
          >
            {results.map((r) => (
              <li key={`${r.category}:${r.code}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r);
                    setQuery("");
                  }}
                  className="tap hover:bg-muted/60 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                >
                  <span
                    className={cn(
                      "rounded px-1 text-[8.5px] font-semibold tracking-wide uppercase",
                      r.category === "ncd"
                        ? "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                        : "text-muted-foreground bg-muted",
                    )}
                  >
                    {r.category}
                  </span>
                  <span className="text-foreground min-w-0 flex-1 truncate text-[12.5px]">
                    {r.mustNotMiss ? (
                      <AlertTriangleIcon
                        className="mr-1 inline size-3 text-red-600 dark:text-red-400"
                        aria-label="must-not-miss"
                      />
                    ) : null}
                    {r.display}
                  </span>
                  {r.icd10 ? (
                    <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                      {r.icd10}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-1 text-[11px]">
            No catalog match — type your own diagnosis below.
          </p>
        )
      ) : null}
    </div>
  );
}
