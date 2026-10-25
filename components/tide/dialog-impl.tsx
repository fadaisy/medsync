"use client";

import type { DialogProps } from "./controls";
import { XIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ICON } from "./kit";
import { HelpButton } from "./shell";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

/**
 * The patient dialog (W1, ADR 0161): centred and landscape over a dimmed ground, focus trapped and returned
 * (the shared EditorDialog). A dialog that carries Help on the phone keeps Help in its header.
 */
export default function DialogImpl({
  open,
  onOpenChange,
  title,
  withHelp,
  width = "medium",
  footer,
  children,
}: DialogProps) {
  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      width={width}
      className="rounded-pw-sheet bg-pw-surface font-pw text-pw-ink"
    >
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <DialogTitle className="font-pw text-pw-ink flex-1 text-2xl leading-[30px] font-semibold tracking-[-0.02em]">
          {title}
        </DialogTitle>
        {withHelp ? <HelpButton /> : null}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className={cn("bg-pw-surface-3 grid size-12 place-items-center rounded-full", FOCUS)}
        >
          <XIcon className="size-5" {...ICON} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
      {footer ? (
        <div className="border-pw-line flex flex-wrap justify-end gap-3 border-t px-6 py-4">
          {footer}
        </div>
      ) : null}
    </EditorDialog>
  );
}
