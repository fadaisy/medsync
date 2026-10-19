import type { ReactNode } from "react";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { ViewHeader } from "../../_components/v2/view-header";

/**
 * One body, two frames (Lab Workspace v2, Steps 3–10): inside the v2 Quality place a view is an h2 under the
 * shell's top bar; on the old route (flag off) it keeps the old page container and PageHeader.
 */
export function Frame({
  v2,
  hospital,
  title,
  subline,
  right,
  lede,
  children,
}: {
  v2: boolean;
  hospital: string;
  title: string;
  subline?: ReactNode;
  right?: ReactNode;
  lede?: string;
  children: ReactNode;
}) {
  const ledeLine = lede ? (
    <p className="text-body-s text-muted-foreground max-w-3xl">{lede}</p>
  ) : null;
  if (v2)
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ViewHeader title={title} subline={subline ?? lede} right={right} />
        {children}
      </div>
    );
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${hospital} · ${LAB.place}`}
        placeInTopBar
        title={title}
        subline={subline}
        right={right}
      />
      {ledeLine}
      {children}
    </div>
  );
}
