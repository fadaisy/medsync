"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRightIcon,
  Building2Icon,
  CalendarClockIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useHospitalScope } from "./scope-provider";

/**
 * ⌘K palette — hospital-admin variant.
 *
 * Nav-only for now (the contract for entity/action search is documented
 * in /docs/hospital-admin-integration-contract.md and will be wired by
 * each feature prompt as it lands). What's already in place:
 *
 *   - Global ⌘K / Ctrl+K binding to open / close.
 *   - Scope marker in the modal header — the operator can never forget
 *     which hospital the palette is acting on.
 *   - Reusable group treatment ("Navigate") with the same Combobox
 *     primitives the superadmin palette uses, so feature prompts can
 *     copy the registration shape.
 *
 * Important: this palette is **scoped** — entries route only to surfaces
 * within /hospital-admin. It must NEVER expose cross-tenant entities
 * (other hospitals, other hospitals' staff). Feature prompts that
 * register entity search MUST pre-scope their fetchers to the current
 * hospital_id from useHospitalScope().
 */

interface NavEntry {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: typeof LayoutDashboardIcon;
}

interface HospitalCommandPaletteProps {
  /** Pre-built nav entries from the shell (mirror of FEATURE_AREAS). */
  navEntries: ReadonlyArray<{
    id: string;
    label: string;
    hint: string;
    href: string;
    iconKey: string;
  }>;
}

const PALETTE_ICONS: Record<string, typeof LayoutDashboardIcon> = {
  overview: LayoutDashboardIcon,
  staff: UsersIcon,
  departments: Building2Icon,
  scheduling: CalendarClockIcon,
  admins: ShieldCheckIcon,
  audit: ScrollTextIcon,
  profile: FileTextIcon,
};

export function HospitalCommandPalette({ navEntries }: HospitalCommandPaletteProps) {
  const router = useRouter();
  const scope = useHospitalScope();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputId = useId();
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const entries: ReadonlyArray<NavEntry> = useMemo(
    () =>
      navEntries.map((e) => ({
        id: e.id,
        label: e.label,
        hint: e.hint,
        href: e.href,
        icon: PALETTE_ICONS[e.iconKey] ?? LayoutDashboardIcon,
      })),
    [navEntries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (item) => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q),
    );
  }, [query, entries]);

  function handleSelect(item: NavEntry) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  const isMac =
    typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform);
  const modKey = isMac ? "⌘" : "Ctrl";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className={cn(
          "border-border bg-background hover:bg-muted text-muted-foreground",
          "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
          "focus-visible:ring-brand-500/40 focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        <SearchIcon className="size-3.5" aria-hidden />
        <span className="hidden md:inline">Jump to…</span>
        <kbd
          aria-hidden
          className="border-border text-muted-foreground hidden rounded border bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] tracking-wider md:inline-flex dark:bg-gray-900"
        >
          {modKey} K
        </kbd>
      </button>

      <DialogPrimitive.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            className={cn(
              "fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-[1px]",
              "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              "ease-expo-out duration-150",
              "motion-reduce:animate-none motion-reduce:duration-0",
            )}
          />
          <DialogPrimitive.Popup
            aria-labelledby={titleId}
            className={cn(
              "bg-popover text-popover-foreground border-border fixed top-[15svh] left-1/2 z-50 w-full max-w-160 -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              "ease-expo-out duration-150",
              "motion-reduce:animate-none motion-reduce:duration-0",
            )}
          >
            <DialogPrimitive.Title id={titleId} className="sr-only">
              {scope.hospitalName} command palette
            </DialogPrimitive.Title>

            <ComboboxPrimitive.Root
              items={filtered}
              open
              inputValue={query}
              onInputValueChange={setQuery}
            >
              <div className="border-border flex items-center gap-3 border-b px-4 py-3">
                <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <label htmlFor={inputId} className="sr-only">
                  Search workspace
                </label>
                <ComboboxPrimitive.Input
                  id={inputId}
                  placeholder="Jump to a section…"
                  autoFocus
                  className={cn(
                    "text-foreground placeholder:text-muted-foreground flex-1 bg-transparent text-[14px] tracking-[-0.004em] outline-none",
                  )}
                />
                <kbd
                  aria-hidden
                  className="border-border text-muted-foreground hidden rounded border bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] tracking-wider sm:inline-flex dark:bg-gray-900"
                >
                  ESC
                </kbd>
              </div>

              <ComboboxPrimitive.List className="max-h-[60svh] overflow-y-auto p-2">
                <ComboboxPrimitive.Empty className="text-muted-foreground text-body-s px-3 py-8 text-center">
                  No matches for &ldquo;{query}&rdquo;.
                </ComboboxPrimitive.Empty>

                <ComboboxPrimitive.Group items={filtered}>
                  <ComboboxPrimitive.GroupLabel className="text-muted-foreground px-3 pt-3 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">
                    Navigate
                  </ComboboxPrimitive.GroupLabel>
                  {filtered.map((item) => (
                    <ComboboxPrimitive.Item
                      key={item.id}
                      value={item}
                      onClick={() => handleSelect(item)}
                      className={cn(
                        "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13.5px] outline-none",
                        "data-highlighted:bg-muted",
                      )}
                    >
                      <item.icon
                        className="text-muted-foreground group-data-highlighted:text-foreground size-4 shrink-0"
                        aria-hidden
                      />
                      <span className="flex-1 truncate">
                        <span className="text-foreground font-medium">{item.label}</span>
                        <span className="text-muted-foreground ml-2 text-[12.5px]">
                          {item.hint}
                        </span>
                      </span>
                      <ArrowRightIcon
                        className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-data-highlighted:opacity-100"
                        aria-hidden
                      />
                    </ComboboxPrimitive.Item>
                  ))}
                </ComboboxPrimitive.Group>
              </ComboboxPrimitive.List>

              <div className="border-border bg-muted/30 text-muted-foreground text-caption flex items-center justify-between border-t px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <kbd className="border-border bg-background rounded border px-1 py-0.5 font-mono text-[10px]">
                      ↑↓
                    </kbd>
                    to navigate
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="border-border bg-background rounded border px-1 py-0.5 font-mono text-[10px]">
                      ↵
                    </kbd>
                    to select
                  </span>
                </div>
                <span
                  className="hidden truncate sm:inline"
                  title={`Scoped to ${scope.hospitalName}`}
                >
                  Scoped to {scope.hospitalName}
                </span>
              </div>
            </ComboboxPrimitive.Root>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
