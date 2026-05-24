"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useRef } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * DataTable — the workhorse table for the admin workspace.
 *
 * Density done well: tight 36px rows, sticky header in gray-50,
 * monospace + tabular-nums for IDs and counts, restrained dividers,
 * calm status pills as cells. Engineered, not bootstrapped.
 *
 * Interaction model:
 *   - Row click OR Enter on a focused row → onRowSelect
 *   - ↑/↓ navigate between rows (no auto-open; Enter opens)
 *   - Home / End jump to the first/last row
 *   - Sortable columns own toggle UI; sort state is controlled by
 *     the parent via `sortKey` + `sortDir` + `onSortChange`
 *
 * What's deliberately out of scope (per spec):
 *   - Pagination — admin queues are bounded (LIMIT 50–200);
 *     virtualisation later if a screen ever exceeds that.
 *   - Bulk selection — added in GATE C when applied to People /
 *     Audit. Destructive bulk actions go through four-eyes per spec,
 *     so the toolbar in those routes adds the selection chrome.
 */

export type SortDirection = "asc" | "desc" | null;

export interface DataTableColumn<TRow> {
  /** Stable key for header click + active-sort lookup. */
  id: string;
  /** Visible header text. */
  header: ReactNode;
  /** Cell renderer. Receives the full row. */
  cell: (row: TRow) => ReactNode;
  /** Monospace + tabular-nums — for IDs, counts, timestamps. */
  mono?: boolean;
  /** Show the sort affordance on this column. Parent owns the state. */
  sortable?: boolean;
  /** Optional cell-level className (e.g. column width, alignment). */
  className?: string;
  /** Optional header-level className (alignment etc.). */
  headerClassName?: string;
  /** Hide on narrow viewports — for noise-reducing columns. */
  hideOnNarrow?: boolean;
}

export interface DataTableProps<TRow> {
  data: ReadonlyArray<TRow>;
  columns: ReadonlyArray<DataTableColumn<TRow>>;
  /** Stable row key extractor (used for React key + aria refs). */
  rowKey: (row: TRow) => string;

  /** Currently sorted column id (controlled). */
  sortKey?: string;
  /** Sort direction (controlled). */
  sortDir?: SortDirection;
  /** Called when a sortable column header is clicked. */
  onSortChange?: (id: string, dir: SortDirection) => void;

  /** Row activation — click or Enter on focused row. */
  onRowSelect?: (row: TRow) => void;

  /** Optional currently-selected row id (visual highlight only). */
  selectedRowId?: string | null;

  /** Toolbar — typically counts + filter chips. */
  toolbar?: ReactNode;
  /** Empty-state node (overrides default). */
  empty?: ReactNode;

  /** ARIA caption for screen readers. */
  caption: string;

  className?: string;
}

export function DataTable<TRow>({
  data,
  columns,
  rowKey,
  sortKey,
  sortDir,
  onSortChange,
  onRowSelect,
  selectedRowId,
  toolbar,
  empty,
  caption,
  className,
}: DataTableProps<TRow>) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const handleHeaderClick = useCallback(
    (col: DataTableColumn<TRow>) => {
      if (!col.sortable || !onSortChange) return;
      // Three-state cycle: null → asc → desc → null
      let next: SortDirection;
      if (sortKey !== col.id) next = "asc";
      else if (sortDir === "asc") next = "desc";
      else if (sortDir === "desc") next = null;
      else next = "asc";
      onSortChange(col.id, next);
    },
    [onSortChange, sortDir, sortKey],
  );

  const handleRowKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableRowElement>, row: TRow) => {
      if (!tbodyRef.current) return;
      const rows = Array.from(
        tbodyRef.current.querySelectorAll<HTMLTableRowElement>('tr[data-row="true"]'),
      );
      const current = rows.indexOf(e.currentTarget);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          rows[Math.min(rows.length - 1, current + 1)]?.focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          rows[Math.max(0, current - 1)]?.focus();
          break;
        case "Home":
          e.preventDefault();
          rows[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          rows[rows.length - 1]?.focus();
          break;
        case "Enter":
        case " ":
          if (onRowSelect) {
            e.preventDefault();
            onRowSelect(row);
          }
          break;
      }
    },
    [onRowSelect],
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {toolbar ? (
        <div className="border-border border-b">
          <div className="px-4 py-2.5 sm:px-6">{toolbar}</div>
        </div>
      ) : null}

      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>

          {/* Sticky header — bg gray-50, 10px overline, semibold,
              gray-500 (per DESIGN-medsync.md "Patient Records Table"
              header pattern). */}
          <thead>
            <tr className="border-border border-b bg-gray-50 dark:bg-gray-900/40">
              {columns.map((col) => {
                const isSorted = sortKey === col.id && sortDir !== null;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={
                      sortKey === col.id
                        ? sortDir === "asc"
                          ? "ascending"
                          : sortDir === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                    className={cn(
                      "text-muted-foreground px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase sm:px-6",
                      col.hideOnNarrow && "hidden md:table-cell",
                      col.headerClassName,
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => handleHeaderClick(col)}
                        className={cn(
                          "group inline-flex items-center gap-1 transition-colors outline-none",
                          "focus-visible:text-foreground hover:text-foreground",
                          isSorted && "text-foreground",
                        )}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortDir === "asc" ? (
                            <ArrowUpIcon className="size-3" aria-hidden />
                          ) : (
                            <ArrowDownIcon className="size-3" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDownIcon
                            className="size-3 opacity-30 group-hover:opacity-70"
                            aria-hidden
                          />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody ref={tbodyRef}>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-muted-foreground px-4 py-16 text-center text-[13px] sm:px-6"
                >
                  {empty ?? "Nothing to show."}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const key = rowKey(row);
                const isSelected = selectedRowId === key;
                return (
                  <tr
                    key={key}
                    data-row="true"
                    data-selected={isSelected || undefined}
                    tabIndex={0}
                    onClick={() => onRowSelect?.(row)}
                    onKeyDown={(e) => handleRowKeyDown(e, row)}
                    className={cn(
                      "border-border border-b transition-colors outline-none",
                      "hover:bg-muted/60 focus-visible:bg-muted/80",
                      "focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-inset",
                      isSelected && "bg-teal-50/60 dark:bg-teal-950/30",
                      onRowSelect && "cursor-pointer",
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          "text-foreground px-4 py-2.5 align-middle text-[13px] sm:px-6",
                          col.mono && "font-mono tabular-nums",
                          col.hideOnNarrow && "hidden md:table-cell",
                          col.className,
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Compact pill — for status, type, and other taxonomy values inside
 * a table cell. Tone maps to DESIGN-medsync.md clinical status colours.
 */
export type PillTone =
  | "neutral"
  | "stable"
  | "caution"
  | "critical"
  | "admitted"
  | "discharged"
  | "pending"
  | "sensitive";

const PILL_TONES: Record<PillTone, string> = {
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  stable: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  caution: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  admitted: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
  discharged: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200",
  pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  sensitive:
    "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/40",
};

export interface PillProps {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}

export function Pill({ tone = "neutral", children, className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * DataTableEmpty — default empty-state component, slotted into the
 * `empty` prop. Spec: "empty states that explain rather than dead-end."
 */
export interface DataTableEmptyProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function DataTableEmpty({ title, description, action }: DataTableEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <p className="text-foreground text-[14px] font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground max-w-md text-[12.5px] leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * DataTableToolbar — header bar slot. Use for filter chips + count.
 * Just lays out children with a sensible default density.
 */
export interface DataTableToolbarProps {
  /** Plain count rendered on the right. */
  count?: number;
  /** Filter chips, search input, etc. */
  children?: ReactNode;
}

export function DataTableToolbar({ count, children }: DataTableToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">{children}</div>
      {typeof count === "number" ? (
        <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
          {count} {count === 1 ? "row" : "rows"}
        </span>
      ) : null}
    </div>
  );
}

/**
 * FilterChip — a single toggleable filter. Click to toggle on/off.
 * Used inside DataTableToolbar.
 */
export interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}

export function FilterChip({ active, onClick, children, count }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-teal-500/40",
        active
          ? "bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40"
          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted ring-border ring-1",
      )}
    >
      <span>{children}</span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums",
            active ? "text-teal-700/80 dark:text-teal-300/80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
