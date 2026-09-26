"use client";

import type { IndexItem } from "../section-index";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SectionIndexView } from "../section-index";

/**
 * The chart's one interactive frame: which section is showing. Every section is server-rendered
 * (so a switch is a local, instant toggle — well under the 100 ms budget, and nothing animates),
 * the URL hash keeps the place (`#chart-results`, so links in the safety bar work), and the new
 * section's heading takes focus. Below `md` the index moves into a sheet (UI-BRIEF §3).
 */
export function ChartShell({
  items,
  panels,
  initial,
}: {
  items: readonly IndexItem[];
  panels: Readonly<Record<string, ReactNode>>;
  initial: string;
}) {
  const [current, setCurrent] = useState(initial);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#chart-/, "");
      if (id && id in panels) setCurrent(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [panels]);

  const select = (id: string, e: { preventDefault(): void }) => {
    e.preventDefault();
    setCurrent(id);
    setSheetOpen(false);
    window.history.replaceState(null, "", `#chart-${id}`);
    // After the panel is shown: move focus to its heading so a keyboard user starts there.
    requestAnimationFrame(() => document.getElementById(`chart-${id}-heading`)?.focus());
  };
  const label = items.find((i) => i.id === current)?.label ?? "";

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[13rem_1fr] md:gap-8">
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger className="border-border text-body-s focus-visible:shadow-focus inline-flex min-h-11 w-full items-center justify-between rounded-md border px-3 outline-none">
            <span className="text-muted-foreground">Section</span>
            <span className="text-foreground font-medium">{label}</span>
          </SheetTrigger>
          <SheetContent side="left" widthClassName="w-[min(20rem,85vw)]">
            <SheetHeader>
              <SheetTitle className="font-sans">Chart</SheetTitle>
            </SheetHeader>
            <div className="px-3 pb-4">
              <SectionIndexView
                label="Chart sections"
                items={items}
                current={current}
                onSelect={select}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <SectionIndexView
        label="Chart sections"
        items={items}
        current={current}
        onSelect={select}
        className="hidden md:block"
      />
      <div className="min-w-0">
        {items.map((it) => (
          <section
            key={it.id}
            id={`chart-${it.id}`}
            aria-labelledby={`chart-${it.id}-heading`}
            hidden={it.id !== current}
          >
            {panels[it.id]}
          </section>
        ))}
      </div>
    </div>
  );
}
