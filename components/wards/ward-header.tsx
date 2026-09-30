"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface WardTabLink {
  id: string;
  name: string;
  sub: string;
  href: string;
  current: boolean;
}

/**
 * The ward builder's and the bed board's header (the prototype's): where you are, the page title, Build
 * or Live bed board, the ward tabs, and the page's own actions on the right. Every link goes through
 * `onNavigate`, so the editor can ask before leaving unsaved changes.
 */
export function WardHeader({
  crumbs,
  title,
  mode,
  buildHref,
  liveHref,
  tabs,
  newWardHref,
  right,
  onNavigate,
}: {
  crumbs: { label: string; href?: string }[];
  title: string;
  mode: "build" | "live";
  /** Null when the viewer can't open the other mode (a nurse has no Build). */
  buildHref: string | null;
  liveHref: string | null;
  tabs: WardTabLink[];
  newWardHref?: string;
  right?: ReactNode;
  onNavigate?: (e: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const go = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => onNavigate?.(e, href);
  return (
    <header className="border-border bg-card flex flex-col gap-3 border-b px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb" className="text-caption text-muted-foreground font-normal">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((c, i) => (
                <li key={c.label} className="inline-flex items-center gap-1">
                  {i > 0 ? <span aria-hidden>/</span> : null}
                  {c.href ? (
                    <Link href={c.href} onClick={go(c.href)} className="hover:text-foreground">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <h1 className="font-display text-display-s text-foreground">{title}</h1>
        </div>
        {buildHref || liveHref ? (
          <nav aria-label="Mode" className="bg-ink-100 inline-flex gap-0.5 rounded-md p-0.5">
            {(
              [
                ["build", "Build", buildHref],
                ["live", "Live bed board", liveHref],
              ] as const
            ).map(([m, label, href]) =>
              href ? (
                <Link
                  key={m}
                  href={href}
                  onClick={go(href)}
                  aria-current={mode === m ? "page" : undefined}
                  className={cn(
                    "text-caption focus-visible:shadow-focus inline-flex h-[26px] items-center rounded-sm px-2.5 font-medium transition-colors duration-100 outline-none",
                    mode === m
                      ? "bg-card text-foreground shadow-control"
                      : "text-ink-600 hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ) : null,
            )}
          </nav>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
      </div>
      {tabs.length ? (
        <nav aria-label="Wards" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              onClick={go(t.href)}
              aria-current={t.current ? "page" : undefined}
              className={cn(
                "focus-visible:shadow-focus flex h-10 shrink-0 flex-col justify-center rounded-md border px-3 outline-none",
                t.current ? "bg-teal-tint border-teal-600" : "hover:bg-ink-100 border-transparent",
              )}
            >
              <span className="text-label text-foreground">{t.name}</span>
              <span className="text-caption text-muted-foreground font-normal">{t.sub}</span>
            </Link>
          ))}
          {newWardHref ? (
            <Link
              href={newWardHref}
              onClick={go(newWardHref)}
              className="border-ink-300 text-label text-ink-700 hover:bg-ink-50 focus-visible:shadow-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-dashed px-3 outline-none"
            >
              <PlusIcon className="size-3.5" aria-hidden />
              New ward
            </Link>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
