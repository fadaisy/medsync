"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRightIcon,
  BoxesIcon,
  ClipboardCheckIcon,
  GaugeIcon,
  KeyIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldAlertIcon,
  UserCogIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Command palette — keyboard-first control room entry.
 *
 * Composition: Dialog hosts the modal envelope (portal, backdrop,
 * focus trap, Esc) and Combobox handles the input/list/filter ARIA.
 * They don't fight because Combobox's Portal/Positioner are not used
 * here — the popup is the Dialog content.
 *
 * Opens on ⌘K (or Ctrl+K) globally, and via the top-bar trigger
 * button rendered above the modal.
 *
 * GATE A scope: navigation items only. GATE B/C will extend with
 * entity + action items routed through the same safeguards.
 */

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: typeof ClipboardCheckIcon;
  group: "Navigate" | "Sensitive actions";
  superadminOnly?: boolean;
  sensitive?: boolean;
}

const ALL_ITEMS: ReadonlyArray<CommandItem> = [
  {
    id: "nav-approvals",
    label: "Approvals",
    hint: "Triage queue — hospitals, staff, leads",
    href: "/admin",
    icon: ClipboardCheckIcon,
    group: "Navigate",
  },
  {
    id: "nav-tenants",
    label: "Tenants",
    hint: "Hospitals + lifecycle",
    href: "/admin/tenants",
    icon: BoxesIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    id: "nav-people",
    label: "People",
    hint: "Operators + clinicians",
    href: "/admin/people",
    icon: UserCogIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    id: "nav-catalog",
    label: "Catalog",
    hint: "Reference data (read-only)",
    href: "/admin/catalog",
    icon: KeyIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    id: "nav-audit",
    label: "Audit",
    hint: "Activity ledger — exportable",
    href: "/admin/audit",
    icon: ScrollTextIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    id: "nav-health",
    label: "Health",
    hint: "Platform glance",
    href: "/admin/health",
    icon: GaugeIcon,
    group: "Navigate",
  },
  {
    id: "act-break-glass",
    label: "Open break-glass…",
    hint: "Time-boxed PHI grant — notifies hospital admins, fully audited",
    href: "/admin/break-glass",
    icon: ShieldAlertIcon,
    group: "Sensitive actions",
    superadminOnly: true,
    sensitive: true,
  },
];

export interface CommandPaletteRootProps {
  isSuperadmin: boolean;
}

export function CommandPaletteRoot({ isSuperadmin }: CommandPaletteRootProps) {
  const router = useRouter();
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

  const visibleItems = useMemo(
    () => ALL_ITEMS.filter((item) => !item.superadminOnly || isSuperadmin),
    [isSuperadmin],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleItems;
    return visibleItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint?.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    );
  }, [query, visibleItems]);

  const grouped = useMemo(() => {
    const groups = new Map<CommandItem["group"], CommandItem[]>();
    for (const item of filtered) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  function handleSelect(item: CommandItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  const isMac =
    typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform);
  const modKey = isMac ? "⌘" : "Ctrl";

  return (
    <>
      {/* Top-bar trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className={cn(
          "border-border bg-background hover:bg-muted text-muted-foreground",
          "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
          "focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:outline-none",
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

      {/* Modal palette — Dialog envelope + Combobox semantics inside */}
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
              Workspace command palette
            </DialogPrimitive.Title>

            <ComboboxPrimitive.Root
              items={filtered}
              open
              inputValue={query}
              onInputValueChange={setQuery}
            >
              {/* Header — search input */}
              <div className="border-border flex items-center gap-3 border-b px-4 py-3">
                <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <label htmlFor={inputId} className="sr-only">
                  Search workspace
                </label>
                <ComboboxPrimitive.Input
                  id={inputId}
                  placeholder="Jump to a section or action…"
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

              {/* Body — grouped list */}
              <ComboboxPrimitive.List className="max-h-[60svh] overflow-y-auto p-2">
                <ComboboxPrimitive.Empty className="text-muted-foreground px-3 py-8 text-center text-[13px]">
                  No matches for &ldquo;{query}&rdquo;.
                </ComboboxPrimitive.Empty>

                {grouped.map(([groupLabel, items]) => (
                  <ComboboxPrimitive.Group key={groupLabel} items={items}>
                    <ComboboxPrimitive.GroupLabel
                      className={cn(
                        "text-muted-foreground px-3 pt-3 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase",
                        groupLabel === "Sensitive actions" && "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {groupLabel}
                    </ComboboxPrimitive.GroupLabel>
                    {items.map((item) => (
                      <ComboboxPrimitive.Item
                        key={item.id}
                        value={item}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13.5px] outline-none",
                          "data-highlighted:bg-muted",
                          item.sensitive &&
                            "data-highlighted:bg-amber-50 dark:data-highlighted:bg-amber-950/30",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-4 shrink-0",
                            item.sensitive
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground group-data-highlighted:text-foreground",
                          )}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">
                          <span className="text-foreground font-medium">{item.label}</span>
                          {item.hint ? (
                            <span className="text-muted-foreground ml-2 text-[12.5px]">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                        <ArrowRightIcon
                          className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-data-highlighted:opacity-100"
                          aria-hidden
                        />
                      </ComboboxPrimitive.Item>
                    ))}
                  </ComboboxPrimitive.Group>
                ))}
              </ComboboxPrimitive.List>

              {/* Footer chrome — keyboard hints */}
              <div className="border-border bg-muted/30 text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-[11px]">
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
                <span className="hidden sm:inline">
                  Sensitive actions route through their own safeguards.
                </span>
              </div>
            </ComboboxPrimitive.Root>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
