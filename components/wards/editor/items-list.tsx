"use client";

import type { ItemKind, ItemRef } from "@/lib/wards/editor";
import type { WardLayout } from "@/supabase/functions/_shared/ward-layout";
import { useState } from "react";
import { RotateCwIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { itemsOf, moveTo, remove, rotate, sameRef } from "@/lib/wards/editor";
import { bedSize, dividerLength, fixtureSize } from "@/supabase/functions/_shared/ward-layout";

const KIND_WORD: Record<ItemKind, string> = {
  bed: "Bed",
  room: "Room",
  divider: "Divider",
  door: "Door",
  fixture: "Fixture",
};

/** A whole-cell coordinate in metres, committed on Enter or blur. */
function CoordInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (cells: number) => void;
}) {
  const [draft, setDraft] = useState(String(value / 2));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value / 2));
  }
  const commit = () => {
    const m = Number(draft.replace(",", "."));
    if (!Number.isFinite(m) || m < 0) return setDraft(String(value / 2));
    const cells = Math.round(m * 2);
    if (cells !== value) onCommit(cells);
    else setDraft(String(value / 2));
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(String(value / 2));
        }
      }}
      className="border-input bg-card text-body-s focus-visible:border-ring focus-visible:ring-teal-tint h-[30px] w-16 rounded-md border px-2 text-right font-mono tabular-nums outline-none focus-visible:ring-3"
    />
  );
}

/**
 * Every bed, room, divider, door and fixture as a table (ADR 0195 §6): select one to edit it in the
 * inspector, move it by its x and y (in metres), rotate it, delete it. Full keyboard and screen-reader
 * access; drag is never the only way.
 */
export function ItemsList({
  doc,
  selected,
  onChange,
  onSelect,
}: {
  doc: WardLayout;
  selected: ItemRef | null;
  onChange: (d: WardLayout) => void;
  onSelect: (r: ItemRef | null) => void;
}) {
  const rows = itemsOf(doc);
  const detail = (r: (typeof rows)[number]) => {
    if (r.ref.kind === "bed") {
      const b = doc.beds.find((x) => x.key === r.ref.key)!;
      return `${bedSize(b.type).label}${b.status === "out" ? " · out of service" : ""}`;
    }
    if (r.ref.kind === "fixture")
      return fixtureSize(doc.fixtures.find((x) => x.key === r.ref.key)!.kind).label;
    if (r.ref.kind === "divider") {
      return `${dividerLength(doc.dividers.find((x) => x.key === r.ref.key)!) / 2} m long`;
    }
    if (r.ref.kind === "room") return doc.rooms.find((x) => x.key === r.ref.key)!.kind;
    return "1 m";
  };
  if (!rows.length)
    return (
      <p className="text-body-s text-muted-foreground p-4">
        Nothing on the plan yet. Place something from the palette.
      </p>
    );
  return (
    <div className="border-border bg-card overflow-auto rounded-lg border">
      <table className="text-body-s w-full border-collapse">
        <caption className="sr-only">
          Every item on the plan. Positions are in metres from the top-left corner of the floor.
        </caption>
        <thead className="bg-muted text-caption text-ink-600 sticky top-0">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Item
            </th>
            <th scope="col" className="px-2 py-2 text-left font-medium">
              What
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              x (m)
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              y (m)
            </th>
            <th scope="col" className="px-2 py-2 text-left font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = sameRef(selected, r.ref);
            const name = r.name;
            // "Door (2 of 4)" already says what it is; "Divider Window" needs the kind word.
            const kind = name.startsWith(KIND_WORD[r.ref.kind]) ? "" : `${KIND_WORD[r.ref.kind]} `;
            return (
              <tr
                key={`${r.ref.kind}:${r.ref.key}`}
                className={cn("border-ink-150 border-t", on && "bg-accent")}
              >
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(on ? null : r.ref)}
                    aria-pressed={on}
                    className="text-foreground hover:text-teal-text focus-visible:shadow-focus rounded-sm text-left outline-none"
                  >
                    {kind && (
                      <span className="text-muted-foreground text-caption mr-1.5">
                        {kind.trim()}
                      </span>
                    )}
                    <span className={cn(r.ref.kind === "bed" && "font-mono")}>{name}</span>
                  </button>
                </th>
                <td className="text-ink-600 text-caption px-2 py-1.5 font-normal">{detail(r)}</td>
                <td className="px-2 py-1.5 text-right">
                  <CoordInput
                    label={`${kind}${name}: x in metres`}
                    value={r.x}
                    onCommit={(x) => onChange(moveTo(doc, r.ref, x, r.y))}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <CoordInput
                    label={`${kind}${name}: y in metres`}
                    value={r.y}
                    onCommit={(y) => onChange(moveTo(doc, r.ref, r.x, y))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Rotate ${kind.toLowerCase()}${name}`}
                      onClick={() => onChange(rotate(doc, r.ref))}
                    >
                      <RotateCwIcon aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Delete ${kind.toLowerCase()}${name}`}
                      onClick={() => {
                        onChange(remove(doc, r.ref));
                        if (on) onSelect(null);
                      }}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
