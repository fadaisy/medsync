"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

/**
 * Tooltip: a thin base-ui wrapper in the popover's skin (bg-popover, shadow-popover, 150 ms
 * expo-out). For hover and focus detail on a control whose click does something else (a flag
 * badge jumps to its section). Not for content a touch user must reach: put that in the page.
 */
function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ delay = 200, ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" delay={delay} {...props} />;
}

function TooltipContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        className="isolate z-50 outline-none"
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "bg-popover text-popover-foreground shadow-popover z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md px-3 py-2.5",
            "ease-expo-out origin-(--transform-origin) transition-[opacity,transform] duration-150",
            "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0",
            "motion-reduce:data-[ending-style]:scale-100 motion-reduce:data-[starting-style]:scale-100",
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };
