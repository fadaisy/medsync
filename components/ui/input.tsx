import type * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input w-full min-w-0 border bg-white px-2.5 py-2 text-[13px] text-gray-900",
        "ease-expo-out rounded-sm transition-all duration-150 outline-none",
        "placeholder:text-gray-400",
        "focus-visible:border-teal-500 focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:bg-alert-bg",
        "aria-invalid:shadow-[0_0_0_2px_rgba(220,38,38,0.1)]",
        "file:text-foreground file:inline-flex file:border-0 file:bg-transparent file:text-[13px] file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
