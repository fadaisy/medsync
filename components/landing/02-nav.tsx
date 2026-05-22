"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * §02 — Top nav. Mirrors Attio's mega-menu + sticky-shrink pattern.
 * Stub: shows the menu shape; mega-menus + mobile sheet land in GATE B.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "bg-background/80 sticky top-0 z-30 w-full backdrop-blur",
        scrolled ? "border-border border-b py-2 shadow-sm" : "py-4",
        "ease-expo-out transition-all duration-200",
      )}
    >
      <div className="mx-auto flex w-full max-w-300 items-center justify-between gap-4 px-6 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="font-display text-heading-s text-foreground tracking-tight">
            MedSync
          </span>
        </Link>

        <nav className="text-muted-foreground hidden items-center gap-6 text-[13px] md:flex">
          <button type="button" className="hover:text-foreground transition-colors">
            Platform ▾
          </button>
          <button type="button" className="hover:text-foreground transition-colors">
            Ecosystem ▾
          </button>
          <Link href="/onboarding/hospital" className="hover:text-foreground transition-colors">
            For Hospitals
          </Link>
          <Link href="/onboarding/clinical" className="hover:text-foreground transition-colors">
            For Clinicians
          </Link>
          <button type="button" className="hover:text-foreground transition-colors">
            Company ▾
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground hidden text-[13px] transition-colors md:inline"
          >
            Sign in
          </Link>
          <Button
            render={<Link href="/onboarding/hospital" />}
            nativeButton={false}
            variant="primary"
            size="sm"
          >
            Request pilot
          </Button>
        </div>
      </div>
    </header>
  );
}
