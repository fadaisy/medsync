"use client";

import { useState } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { SheetBody, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** A catalogue v2 draft's payload as readable lines, in the centred dialog (ADR 0161). */
export function ConfigView({
  title,
  description,
  lines,
}: {
  title: string;
  description: string;
  lines: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        View<span className="sr-only"> {title}</span>
      </Button>
      <EditorDialog width="medium" open={open} onOpenChange={setOpen}>
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <ul className="text-body-s flex flex-col gap-1">
              {lines.map((l, i) => (
                <li key={i} className={l.startsWith(" ") ? "pl-4" : undefined}>
                  {l.trim()}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </SheetBody>
        </div>
      </EditorDialog>
    </>
  );
}
