import type { PatientIdentity } from "@/components/emr/orders/model";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/tide/work/kit";

/**
 * A read-only lab list (Released today, Rejected; Lab Phase 0 §5.5): the worklist's table look
 * (Chroma RecordTable: sticky 34 px header on muted, ink-150 hairlines) on desktop, one block per
 * record on a phone. Server-rendered: nothing to sort or filter, so no client code ships.
 */
export interface RecordColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
}

export function RecordList<T>({
  caption,
  rows,
  rowKey,
  columns,
  empty,
}: {
  caption: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: readonly RecordColumn<T>[];
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <>
      <div className="border-border bg-card hidden overflow-auto rounded-lg border md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-muted">
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="text-ink-600 text-caption border-border [&+&]:border-l-ink-150 h-[34px] border-b px-3 font-medium whitespace-nowrap [&+&]:border-l"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-ink-150 border-b last:border-b-0">
                {columns.map((c) => (
                  <td key={c.id} className="text-body-s px-3 py-2 align-middle">
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-border border-border flex flex-col divide-y border-y md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="flex flex-col gap-1 py-3">
            {columns.map((c) => (
              <div key={c.id} className="text-body-s flex flex-wrap gap-x-2">
                <span className="text-muted-foreground min-w-24">{c.header}</span>
                <span className="min-w-0">{c.cell(r)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

export function PatientNameMrn({ identity }: { identity: PatientIdentity | undefined }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-foreground font-medium">{identity?.name ?? "Name withheld"}</span>
      <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
        {identity?.mrn ?? ""}
      </span>
    </span>
  );
}
