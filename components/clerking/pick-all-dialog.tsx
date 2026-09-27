"use client";

import { useState } from "react";
import { CheckIcon, LockIcon, PlusIcon, SearchIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { Button } from "@/components/ui/button";
import { Chip } from "./controls";

/**
 * A whole list in a centred pop-up (ADR 0161): groups of chips, a filter, tap to add, the list
 * stays open. Used for "Show all" complaints and past operations.
 */

export interface PickGroup {
  id: string;
  label: string;
  items: { id: string; label: string; terms?: readonly string[]; restricted?: boolean }[];
}

export function PickAllDialog({
  open,
  onOpenChange,
  kicker,
  title,
  description,
  empty,
  groups,
  added,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kicker: string;
  title: string;
  description: string;
  /** Shown when the filter matches nothing. */
  empty: string;
  groups: readonly PickGroup[];
  added: ReadonlySet<string>;
  onPick: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const shown = f
    ? groups
        .map((g) => ({
          ...g,
          items: g.items.filter((s) =>
            [s.label, ...(s.terms ?? [])].some((x) => x.toLowerCase().includes(f)),
          ),
        }))
        .filter((g) => g.items.length)
    : groups;
  return (
    <EmrDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setFilter("");
      }}
      width="wide"
      sheet="tall"
      kicker={kicker}
      title={title}
      description={description}
      footer={
        <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="border-input bg-card focus-within:shadow-focus flex min-h-9 items-center gap-2 rounded-sm border px-2.5 pointer-coarse:min-h-11">
          <SearchIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <span className="sr-only">{`Filter ${title.toLowerCase()}`}</span>
          <input
            value={filter}
            autoComplete="off"
            placeholder="Filter by name or synonym"
            onChange={(e) => setFilter(e.target.value)}
            className="text-body-s text-foreground min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {shown.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{empty}</p>
        ) : (
          <div className="gap-x-8 md:columns-2">
            {shown.map((g) => (
              <section
                key={g.id}
                aria-labelledby={`pick-all-${g.id}`}
                className="mb-5 flex break-inside-avoid flex-col gap-2"
              >
                <h3 id={`pick-all-${g.id}`} className="text-body-s text-foreground font-medium">
                  {g.label}
                </h3>
                <div className="flex flex-wrap gap-1.5 max-sm:gap-2">
                  {g.items.map((s) => {
                    const on = added.has(s.id);
                    return (
                      <Chip key={s.id} dashed={!on} selected={on} onPress={() => onPick(s.id)}>
                        {on ? (
                          <CheckIcon aria-hidden className="size-3.5" />
                        ) : (
                          <PlusIcon aria-hidden className="size-3.5" />
                        )}
                        {s.label}
                        {s.restricted ? (
                          <LockIcon aria-label="Restricted" className="size-3" />
                        ) : null}
                        {on ? <span className="sr-only">(added)</span> : null}
                      </Chip>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </EmrDialog>
  );
}
