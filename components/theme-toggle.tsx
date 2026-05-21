"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

/**
 * Sun ↔ Moon switch.
 *
 * Icons are toggled by CSS (`dark:` variant) so they crossfade correctly even
 * on first paint — next-themes injects a synchronous script that sets the
 * `.dark` class on `<html>` before hydration. React state is only needed for
 * the click handler / aria-checked attribute.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      // Always render a boolean so SSR matches the first client render and
      // hydration succeeds. The real value flips once next-themes resolves.
      aria-checked={isDark}
      aria-label="Toggle light / dark theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative inline-flex h-7 w-7 items-center justify-center rounded-sm",
        "border-border bg-card text-muted-foreground border",
        "ease-expo-out transition-all duration-150",
        "hover:bg-muted hover:text-foreground",
        "focus-visible:shadow-focus focus-visible:outline-none",
        className,
      )}
    >
      <SunIcon className="size-3.5 scale-100 rotate-0 transition-transform duration-200 dark:scale-0 dark:-rotate-90" />
      <MoonIcon className="absolute size-3.5 scale-0 rotate-90 transition-transform duration-200 dark:scale-100 dark:rotate-0" />
    </button>
  );
}
