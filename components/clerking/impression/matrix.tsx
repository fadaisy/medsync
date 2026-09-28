"use client";

import type { SiView } from "../si-model";
import type { ImpressionView } from "./model";
import type { BoardRow } from "@/lib/clerking/impression/board";
import type { CellState, Column } from "@/lib/clerking/impression/evidence";
import type { Finding } from "@/lib/clerking/impression/facts";
import type { KeyboardEvent } from "react";
import { ShieldAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cellState, pendingSuggestions } from "@/lib/clerking/impression/evidence";
import { cn } from "@/lib/utils";
import { FindingText } from "../summary/summary-step";

/**
 * The evidence matrix (§5.4): findings as rows, the board's diagnoses as columns, a button in each
 * cell. Suggested marks are dotted and say "Suggested"; For and Against are neutral greys with a
 * sign and a word (colour never carries the state; no red, amber or green in cells). Arrow keys move
 * between cells; Space or Enter cycles; `a` accepts the focused column's suggestions. A real
 * <table> with row and column headers; the first column stays put while the table scrolls sideways.
 */

const WORD: Record<CellState, string> = {
  blank: "not weighed",
  suggested_for: "suggested for",
  suggested_against: "suggested against",
  for: "for",
  against: "against",
};

function CellFace({ s }: { s: CellState }) {
  if (s === "blank")
    return (
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
    );
  const suggested = s === "suggested_for" || s === "suggested_against";
  const plus = s === "for" || s === "suggested_for";
  return (
    <span aria-hidden className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="font-mono">{plus ? "+" : "−"}</span>
      {suggested ? "Suggested" : plus ? "For" : "Against"}
    </span>
  );
}

const CELL: Record<CellState, string> = {
  blank: "hover:bg-muted",
  suggested_for: "border border-dashed border-ink-400 text-foreground hover:bg-muted",
  suggested_against: "border border-dashed border-ink-400 text-foreground hover:bg-muted",
  for: "bg-ink-100 text-foreground dark:bg-ink-700",
  against: "bg-card text-foreground ring-1 ring-inset ring-ink-300",
};

function header(row: BoardRow): { tag: string; mnm: boolean } {
  if (row.slot === "leading") return { tag: "Leading", mnm: false };
  if (row.slot === "also") return { tag: "Also", mnm: false };
  return { tag: `#${row.position}`, mnm: row.mustNotMiss };
}

export interface MatrixProps {
  si: SiView;
  v: ImpressionView;
  all: boolean;
  onAll: (all: boolean) => void;
  editable: boolean;
  onCycle: (col: Column, f: Finding) => void;
  onAccept: (col: Column) => void;
  onDetails: (logicalId: string) => void;
}

export function EvidenceMatrix({
  si,
  v,
  all,
  onAll,
  editable,
  onCycle,
  onAccept,
  onDetails,
}: MatrixProps) {
  const m = all ? v.matrixAll : v.matrix;
  const cols = v.cols;
  if (!m.rows.length)
    return (
      <p className="text-body-s text-muted-foreground">
        Nothing recorded to weigh yet. Record the history and examination first.
      </p>
    );
  const onKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    const [r, c] = cell.dataset.cell!.split(",").map(Number) as [number, number];
    const go = (rr: number, cc: number) => {
      const next = e.currentTarget.querySelector<HTMLElement>(`[data-cell="${rr},${cc}"]`);
      if (next) {
        e.preventDefault();
        next.focus();
      }
    };
    if (e.key === "ArrowDown") go(r + 1, c);
    else if (e.key === "ArrowUp") go(r - 1, c);
    else if (e.key === "ArrowRight") go(r, c + 1);
    else if (e.key === "ArrowLeft") go(r, c - 1);
    else if (e.key === "a" && editable && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onAccept(cols[c]!);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div
        role="region"
        aria-label="Evidence matrix, scrolls sideways"
        tabIndex={-1}
        className="border-border max-w-full overflow-x-auto rounded-md border"
      >
        <table
          onKeyDown={onKey}
          className="text-body-s w-max min-w-full border-separate border-spacing-0"
        >
          <caption className="sr-only">
            Findings against diagnoses. Suggested marks are decision support until you accept them.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="bg-card border-border text-caption text-muted-foreground sticky left-0 z-10 min-w-[220px] border-b px-3 py-2 text-left font-medium"
              >
                Finding
              </th>
              {cols.map((c) => {
                const h = header(c.row);
                return (
                  <th
                    key={c.row.dx.logicalId}
                    scope="col"
                    className="border-border border-b border-l px-2 py-1.5 text-left align-bottom font-normal"
                  >
                    <button
                      type="button"
                      onClick={() => onDetails(c.row.dx.logicalId)}
                      className="hover:bg-muted focus-visible:shadow-focus flex max-w-[168px] flex-col items-start gap-0.5 rounded-sm px-1 py-0.5 text-left outline-none"
                    >
                      <span
                        className={cn(
                          "text-caption font-mono tracking-[0.04em] uppercase",
                          c.row.slot === "leading"
                            ? "text-teal-700 dark:text-teal-300"
                            : "text-muted-foreground",
                        )}
                      >
                        {h.tag}
                        {h.mnm ? (
                          <span className="dark:text-status-caution-fg text-amber-800">
                            {" · Must not miss"}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-body-s text-foreground line-clamp-2 font-medium">
                        {c.row.dx.display}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((f, r) => (
              <tr key={f.ref}>
                <th
                  scope="row"
                  className="bg-card border-border sticky left-0 z-10 border-b px-3 py-1.5 text-left font-normal"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn(!f.positive && "text-muted-foreground")}>
                      <FindingText item={f} news2={si.x.news2Latest} />
                    </span>
                    <span className="text-caption text-muted-foreground font-mono tabular-nums">
                      {f.step}
                    </span>
                  </span>
                </th>
                {cols.map((c, ci) => {
                  const s = cellState(c, f.ref);
                  return (
                    <td key={c.row.dx.logicalId} className="border-border border-b border-l p-1">
                      <button
                        type="button"
                        data-cell={`${r},${ci}`}
                        data-col={ci}
                        disabled={!editable}
                        aria-label={`${f.text} for ${c.row.dx.display}: ${WORD[s]}. Select to change.`}
                        onClick={() => onCycle(c, f)}
                        className={cn(
                          "text-caption focus-visible:shadow-focus inline-flex min-h-7 w-full min-w-[104px] items-center justify-center rounded-sm px-1.5 outline-none pointer-coarse:min-h-11",
                          "ease-expo-out transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none",
                          CELL[s],
                        )}
                      >
                        <CellFace s={s} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="bg-card sticky left-0 z-10 px-3 py-2 text-left">
                <span className="text-caption text-muted-foreground">Accepted</span>
              </th>
              {cols.map((c) => {
                const a = Object.values(c.accepted);
                const k = pendingSuggestions(c);
                return (
                  <td
                    key={c.row.dx.logicalId}
                    className="border-border border-l px-2 py-2 align-top"
                  >
                    <div className="flex flex-col items-start gap-1.5">
                      <span className="text-caption text-muted-foreground font-mono tabular-nums">
                        {`${a.filter((x) => x.w === "for").length} + · ${a.filter((x) => x.w === "against").length} −`}
                      </span>
                      {editable && k ? (
                        <Button size="sm" variant="secondary" onClick={() => onAccept(c)}>
                          {`Accept suggested (${k})`}
                        </Button>
                      ) : null}
                      {c.row.awaitingSignoff ? (
                        <span className="text-caption text-muted-foreground">
                          Reasoning aids awaiting sign-off
                        </span>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {all || m.more ? (
          <Button size="sm" variant="ghost" onClick={() => onAll(!all)}>
            {all ? "Show the findings that matter" : `Show all recorded findings (${m.more} more)`}
          </Button>
        ) : null}
        <span className="text-caption text-muted-foreground inline-flex items-center gap-1">
          <ShieldAlertIcon aria-hidden className="size-3" />
          Suggested marks are decision support. Nothing is stored until you accept it.
        </span>
      </div>
    </div>
  );
}
