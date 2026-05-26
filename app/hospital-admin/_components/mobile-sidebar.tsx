"use client";

import type { FeatureIconKey } from "../_lib/features";
import { useState } from "react";
import { MenuIcon } from "lucide-react";

import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { HospitalSidebarItem } from "./hospital-sidebar-item";

/**
 * Mobile-only sidebar trigger + sheet. The persistent sidebar is hidden
 * below `lg`; this slides the nav in from the left when the hamburger
 * is tapped, and auto-closes when a nav row is selected (via SheetClose
 * wrapping each row).
 */

export interface MobileHospitalNavItem {
  href: string;
  label: string;
  iconKey: FeatureIconKey;
  badgeCount?: number;
}

interface Props {
  items: ReadonlyArray<MobileHospitalNavItem>;
  hospitalName: string;
  adminEmail: string;
}

export function MobileSidebar({ items, hospitalName, adminEmail }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className={cn(
          "border-border bg-background text-muted-foreground inline-flex items-center justify-center rounded-md border p-1.5 transition-colors outline-none lg:hidden",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-teal-500/40",
        )}
      >
        <MenuIcon className="size-4" aria-hidden />
      </button>

      <SheetContent side="left" widthClassName="w-[280px]" showCloseButton={false}>
        <SheetTitle className="sr-only">Workspace navigation</SheetTitle>

        <div className="border-border flex flex-col gap-0.5 border-b px-5 py-3">
          <span className="font-display text-foreground text-[15px] font-medium tracking-[-0.01em]">
            MedSync
          </span>
          <span
            className="text-muted-foreground truncate font-mono text-[10px] tracking-[0.12em] uppercase"
            title={hospitalName}
          >
            {hospitalName}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-px">
            {items.map((item) => (
              <li key={item.href}>
                <SheetClose render={<div />}>
                  <HospitalSidebarItem
                    href={item.href}
                    label={item.label}
                    iconKey={item.iconKey}
                    badgeCount={item.badgeCount}
                  />
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-border border-t p-3">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <div
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-100 font-mono text-[11px] font-semibold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200"
            >
              {adminEmail.slice(0, 1).toUpperCase()}
            </div>
            <p className="text-foreground truncate text-[12px] font-medium">{adminEmail}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
