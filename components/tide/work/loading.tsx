import type { ReactNode } from "react";

import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_LOADING } from "@/content/lab-workspace-v2-loading";
import { cn } from "@/lib/utils";

/**
 * Loading skeletons for the lab places (route `loading.tsx` files). Only the content area waits: the rail and
 * the top bar stay. Shapes mirror the field kit (PillTabs, Panel, the bench grid) so nothing jumps on arrival.
 * No decoration: the bones pulse only where motion is allowed.
 */
export function Bone({ className }: { className?: string }) {
  return <div className={cn("bg-tide-sunken rounded-md motion-safe:animate-pulse", className)} />;
}

/** A Panel's shape: a heading line, then rows. */
export function CardBone({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn(
        "bg-card shadow-tide-card rounded-tide-card flex flex-col gap-3 p-4",
        className,
      )}
    >
      <Bone className="h-5 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Bone key={i} className="h-10" />
      ))}
    </div>
  );
}

/** PillTabs' shape. */
export function TabsBone({ n = 4 }: { n?: number }) {
  return (
    <div className="bg-tide-sunken flex w-fit max-w-full gap-1 rounded-full p-1">
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="bg-card/70 h-8 w-20 rounded-full motion-safe:animate-pulse sm:w-24"
        />
      ))}
    </div>
  );
}

/** SpaceHeader's shape: tabs, then the place's one action on the right. */
export function HeaderBone({ tabs = 4, action = true }: { tabs?: number; action?: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <TabsBone n={tabs} />
      <span className="flex-1" />
      {action ? <Bone className="h-9 w-32 rounded-full" /> : null}
    </div>
  );
}

/** The waiting content area: busy, with one polite line for screen readers (bones are hidden from them). */
export function PlaceLoading({
  place,
  className,
  children,
}: {
  place: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-busy="true" className={className}>
      <p role="status" className="sr-only">
        {fill(LABWS2_LOADING.place, { place })}
      </p>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

/** A view inside a place (Set-up pages, records): back link, heading, tabs, one card. */
export function ViewLoading({ place }: { place: string }) {
  return (
    <PlaceLoading
      place={place}
      className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6"
    >
      <Bone className="h-4 w-16" />
      <Bone className="h-7 w-64" />
      <TabsBone n={3} />
      <CardBone rows={5} />
    </PlaceLoading>
  );
}

/** A place with tabs over one card (Send-outs, Quality, Reports, and the fallback). */
export function TabbedLoading({ place, tabs = 5 }: { place: string; tabs?: number }) {
  return (
    <PlaceLoading place={place}>
      <HeaderBone tabs={tabs} />
      <CardBone rows={6} />
    </PlaceLoading>
  );
}
