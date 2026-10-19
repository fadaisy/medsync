import type { ReactNode } from "react";

/**
 * A view's own heading inside a place (Lab Workspace v2): the top bar holds the page's h1 (the place), so a
 * view or a record opened inside it is an h2, with an optional subline and its controls on the right.
 */
export function ViewHeader({
  title,
  subline,
  right,
}: {
  title: string;
  subline?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-heading-m text-foreground">{title}</h2>
        {subline ? <p className="text-body-s text-muted-foreground">{subline}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}
