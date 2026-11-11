import type { RecordColumn } from "../../_components/record-list";

import { EmptyState } from "@/components/tide/work/kit";
import { RecordList } from "../../_components/record-list";

/**
 * The quality, stock and equipment lists (Lab Workspace v2 field kit): the shared RecordList, but an empty list
 * is an empty state that says why, never a dashed box (Law 7).
 */
export function QList<T>({
  caption,
  rows,
  rowKey,
  columns,
  empty,
  why,
}: {
  caption: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: readonly RecordColumn<T>[];
  empty: string;
  why?: string;
}) {
  if (!rows.length) return <EmptyState compact title={empty} why={why} />;
  return (
    <RecordList caption={caption} rows={rows} rowKey={rowKey} columns={columns} empty={empty} />
  );
}
