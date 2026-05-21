import type { VariantProps } from "class-variance-authority";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "font-medium [letter-spacing:-0.01em] outline-none select-none",
    "transition-all duration-150 ease-expo-out",
    "focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.4)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:not(:disabled):translate-y-px",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800",
        secondary:
          "bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-150",
        ghost:
          "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700 active:bg-gray-150",
        tealSoft:
          "bg-teal-50 border border-teal-100 text-teal-600 hover:bg-teal-100/70 hover:border-teal-200",
        emergency: "bg-destructive text-white hover:bg-red-700 active:bg-red-800",
        alert: "bg-alert-bg border border-alert-border text-destructive hover:bg-red-50",
        link: "text-teal-600 underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "px-2.5 py-[5px] text-[11px] rounded-sm gap-1.5 [&_svg:not([class*='size-'])]:size-3",
        md: "px-[18px] py-2 text-[13px] rounded-md",
        lg: "px-6 py-[11px] text-[15px] rounded-md",
        iconSm: "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-9 rounded-md",
        iconLg: "size-11 rounded-md [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
