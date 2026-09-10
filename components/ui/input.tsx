import type * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card text-foreground text-body-s w-full min-w-0 border px-2.5 py-2",
        "ease-expo-out rounded-sm transition-all duration-150 outline-none",
        "placeholder:text-gray-400 dark:placeholder:text-gray-400",
        "focus-visible:border-brand-500 focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)]",
        "dark:focus-visible:border-brand-400 dark:focus-visible:shadow-[0_0_0_2px_rgba(45,212,191,0.2)]",
        "disabled:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:bg-alert-bg",
        "aria-invalid:shadow-[0_0_0_2px_rgba(220,38,38,0.1)] dark:aria-invalid:shadow-[0_0_0_2px_rgba(252,165,165,0.1)]",
        "file:text-foreground file:text-body-s file:inline-flex file:border-0 file:bg-transparent file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
