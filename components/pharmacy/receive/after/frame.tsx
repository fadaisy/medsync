"use client";

import type { ReactNode } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Header, scrolling body and footer of the after-view's pop-ups: one centred `EditorDialog`, as the rest of the store. */
export function Frame({
  title,
  lead,
  foot,
  onClose,
  width = "medium",
  printArea,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  foot: ReactNode;
  onClose: () => void;
  width?: "wide" | "medium";
  /** The body is what prints (`print.tsx`). */
  printArea?: boolean;
  children: ReactNode;
}) {
  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width={width}>
      <div data-print-hide className="flex flex-col gap-1 px-4 pt-5 sm:px-6">
        <DialogTitle>{title}</DialogTitle>
        {lead ? <DialogDescription>{lead}</DialogDescription> : null}
      </div>
      <div
        {...(printArea ? { "data-print-area": "" } : {})}
        className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6")}
      >
        {children}
      </div>
      <div
        data-print-hide
        className="border-border flex flex-wrap justify-end gap-2 border-t px-4 py-3.5 sm:px-6"
      >
        {foot}
      </div>
    </EditorDialog>
  );
}
