/**
 * A figure with a label, and the marker that says where a number came from.
 */

import type { ReactNode } from "react";

export function Figures({ children }: { children: ReactNode }) {
  return <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">{children}</dl>;
}

export function Figure({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="text-body-s truncate font-mono">
        {value}
        {note ? <span className="text-micro text-muted ml-1">{note}</span> : null}
      </dd>
    </div>
  );
}

/**
 * The `est` marker.
 *
 * It means the quantity behind this number is an engineering estimate rather
 * than anything taken from a document: a property of a device that does not
 * exist, chosen here because the model needed a value. It is not a confidence
 * interval and it is not a hedge, it is a statement about provenance, and the
 * constants table carries the same distinction for every one of them.
 */
export function Est({ children }: { children?: ReactNode }) {
  return (
    <>
      <abbr
        title="Engineering estimate: a property of a device that does not exist, chosen for this model rather than taken from a source."
        className="border-edge text-muted rounded-[2px] border px-1 py-px font-mono text-[9px] tracking-wide uppercase no-underline"
      >
        est
      </abbr>
      {children ? <span className="ml-1">{children}</span> : null}
    </>
  );
}
