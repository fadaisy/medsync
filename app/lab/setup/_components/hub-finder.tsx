"use client";

import type { HubGroup } from "@/lib/lab/setup-hub";
import type { ReactNode } from "react";
import Link from "next/link";
import { useId, useState } from "react";
import { SearchIcon } from "lucide-react";

import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { EmptyState, Pill } from "../../_components/v2/kit";

const S = LABWS2_SETUP;

/**
 * Find a setting (prompt 5.8): a filter over the hub's own links, by name, group or status. The signature
 * queue (children) sits between the search and the groups, as on the canvas.
 */
export function HubFinder({ groups, children }: { groups: HubGroup[]; children: ReactNode }) {
  const id = useId();
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (s: string) => words.every((w) => s.toLowerCase().includes(w));
  const shown = groups
    .map((g) => ({
      ...g,
      links: g.links.filter((l) => hit(`${g.title} ${l.label} ${l.status.text}`)),
    }))
    .filter((g) => g.links.length > 0);
  return (
    <>
      <div className="relative w-full max-w-md">
        <label htmlFor={id} className="sr-only">
          {S.find.label}
        </label>
        <SearchIcon
          aria-hidden
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={S.find.placeholder}
          aria-controls={`${id}-groups`}
          className="bg-card text-foreground border-input rounded-tide-field text-body-s focus-visible:border-ring focus-visible:shadow-focus h-10 w-full border pr-3 pl-9 outline-none"
        />
      </div>
      {children}
      <div
        id={`${id}-groups`}
        aria-live="polite"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {shown.length === 0 ? (
          <EmptyState
            className="md:col-span-2 xl:col-span-3"
            title={fill(S.find.noneTitle, { q: q.trim() })}
            why={S.find.noneWhy}
          />
        ) : (
          shown.map((g) => (
            <section
              key={g.id}
              aria-labelledby={`${id}-${g.id}`}
              className="bg-card shadow-tide-card rounded-tide-card flex flex-col p-2"
            >
              <h2 id={`${id}-${g.id}`} className="text-heading-s text-foreground px-2 pt-2 pb-1">
                {g.title}
              </h2>
              <ul className="flex flex-col">
                {g.links.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={l.href}
                      className="hover:bg-muted focus-visible:shadow-focus rounded-tide-row flex min-h-11 items-center justify-between gap-3 px-2 py-2 outline-none"
                    >
                      <span className="text-body-s text-foreground font-medium">{l.label}</span>
                      {l.status.tone === "neutral" ? (
                        <span className="text-caption text-muted-foreground text-right">
                          {l.status.text}
                        </span>
                      ) : (
                        <Pill
                          tone="neutral"
                          className={
                            l.status.tone === "not_set"
                              ? "bg-card shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
                              : undefined
                          }
                        >
                          {l.status.text}
                        </Pill>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
