"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Responsive slide-out container.
 *
 *   - md and up: behaves exactly like the existing <Sheet> — side-
 *     anchored, slides in from the right.
 *   - below md: bottom-anchored full-height sheet with a drag affordance
 *     at the top.
 *
 * Same composition + API as <Sheet> so call sites are interchangeable
 * — swap <Sheet>/<SheetContent> for <ResponsiveSheet>/<ResponsiveSheetContent>.
 * Header / Body / Footer slots are re-exported from the base sheet
 * so existing patterns keep working without a new import.
 *
 * This is the first responsive primitive for the patient app and
 * the foundation for the "patient surfaces are mobile-first" rule.
 */

interface ResponsiveSheetContentProps extends DialogPrimitive.Popup.Props {
  /** Desktop width (md+). Mobile is always full-height bottom sheet. */
  widthClassName?: string;
  /** Optional max-height on mobile (defaults to 92svh so the top edge stays peek-able). */
  mobileMaxHeightClassName?: string;
  showCloseButton?: boolean;
  /**
   * Where the sheet sits on md+: `side` (the default — a right-anchored
   * panel, for lists and editors) or `center` (a dialog in the middle of
   * the screen, for something that must be answered before anything else —
   * the catalog's emergency interrupt). Below md both are the bottom sheet.
   */
  desktop?: "side" | "center";
}

function ResponsiveSheetContent({
  className,
  children,
  widthClassName = "md:max-w-[560px] md:w-full",
  mobileMaxHeightClassName = "max-h-[92svh]",
  showCloseButton = true,
  desktop = "side",
  ...props
}: ResponsiveSheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="responsive-sheet-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-black/35 supports-backdrop-filter:backdrop-blur-[1px]",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          "ease-expo-out duration-200",
          "motion-reduce:animate-none motion-reduce:duration-0",
        )}
      />
      <DialogPrimitive.Popup
        data-slot="responsive-sheet-content"
        className={cn(
          // Mobile (default, < md): full-width bottom sheet, rounded top corners.
          "bg-background text-foreground border-border fixed inset-x-0 bottom-0 z-50",
          "flex w-full flex-col overflow-hidden rounded-t-2xl border-t shadow-2xl outline-none",
          mobileMaxHeightClassName,
          "data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
          // Desktop (md+): a right-anchored full-height panel, or a centred
          // dialog (inset-0 + auto margins + fit height — no transforms, so
          // the enter/exit animation never fights the resting position).
          desktop === "center"
            ? "md:shadow-popover md:inset-0 md:m-auto md:h-fit md:max-h-[calc(100svh-4rem)] md:rounded-2xl md:border"
            : "md:inset-y-0 md:right-0 md:bottom-auto md:left-auto md:max-h-none md:rounded-none md:border-t-0 md:border-l",
          desktop === "center"
            ? "md:data-open:slide-in-from-bottom-0 md:data-open:zoom-in-95 md:data-closed:slide-out-to-bottom-0 md:data-closed:zoom-out-95"
            : "md:data-open:slide-in-from-right md:data-closed:slide-out-to-right",
          widthClassName,
          "ease-expo-out duration-250",
          "motion-reduce:animate-none motion-reduce:duration-0",
          className,
        )}
        {...props}
      >
        {/* Drag handle on mobile only — purely affordance; the dialog
            is dismissed via Esc, backdrop tap, or the close button. */}
        <div
          aria-hidden
          className="bg-muted-foreground/30 mx-auto mt-2 h-1 w-10 shrink-0 rounded-full md:hidden"
        />
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            render={
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Close panel"
                className="absolute top-3 right-3"
              />
            }
          >
            <XIcon className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/* Re-export the base sheet slots so call sites don't need two imports. */
export {
  Sheet as ResponsiveSheet,
  SheetClose as ResponsiveSheetClose,
  ResponsiveSheetContent,
  SheetHeader as ResponsiveSheetHeader,
  SheetTitle as ResponsiveSheetTitle,
  SheetDescription as ResponsiveSheetDescription,
  SheetBody as ResponsiveSheetBody,
  SheetFooter as ResponsiveSheetFooter,
};
