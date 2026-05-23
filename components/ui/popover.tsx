"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

/**
 * Popover — Base UI wrapper.
 *
 * Used by the date picker, combobox, and any other floating-panel
 * surface in MedSync. Owns the surface styling (border, shadow, bg,
 * radii); behaviour (open state, ARIA, focus management, positioning)
 * stays with Base UI.
 */

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverPortal = PopoverPrimitive.Portal;

interface PopoverContentProps extends React.ComponentProps<typeof PopoverPrimitive.Popup> {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

function PopoverContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  children,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPortal>
      <PopoverPrimitive.Positioner side={side} align={align} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup
          className={cn(
            "border-border bg-popover text-popover-foreground shadow-popover rounded-lg border",
            "z-50 outline-none",
            "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            "transition-opacity duration-150 ease-out motion-reduce:transition-none",
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
