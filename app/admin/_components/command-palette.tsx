"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ArrowRightIcon,
  BoxesIcon,
  BuildingIcon,
  ClipboardCheckIcon,
  GaugeIcon,
  KeyIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldAlertIcon,
  UserCogIcon,
  UserIcon,
  UsersRoundIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Command palette — keyboard-first control room entry.
 *
 * GATE C extends GATE A with:
 *   - Entity search (hospitals + users) — passed in from the layout
 *     server-side; filtered client-side as the operator types.
 *   - Same "Sensitive actions" treatment for the Break-glass action.
 *
 * Composition: base-ui Dialog hosts the modal envelope (portal,
 * backdrop, focus trap, Esc); base-ui Combobox handles input + list
 * + filter ARIA. ⌘K / Ctrl+K opens globally.
 */

interface CommandNavItem {
  kind: "nav";
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: typeof ClipboardCheckIcon;
  group: "Navigate" | "Sensitive actions";
  superadminOnly?: boolean;
  sensitive?: boolean;
}

interface CommandHospitalItem {
  kind: "hospital";
  id: string;
  name: string;
  slug: string;
  state: string;
  href: string;
}

interface CommandPersonItem {
  kind: "person";
  id: string;
  fullName: string;
  email: string;
  href: string;
}

type CommandItem = CommandNavItem | CommandHospitalItem | CommandPersonItem;

const NAV_ITEMS: ReadonlyArray<CommandNavItem> = [
  {
    kind: "nav",
    id: "nav-approvals",
    label: "Approvals",
    hint: "Triage queue — hospitals, staff, leads",
    href: "/admin",
    icon: ClipboardCheckIcon,
    group: "Navigate",
  },
  {
    kind: "nav",
    id: "nav-tenants",
    label: "Tenants",
    hint: "Hospitals + lifecycle",
    href: "/admin/tenants",
    icon: BoxesIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    kind: "nav",
    id: "nav-people",
    label: "People",
    hint: "Operators + clinicians",
    href: "/admin/people",
    icon: UserCogIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    kind: "nav",
    id: "nav-staff-rollup",
    label: "Staff rollup",
    hint: "Cross-tenant staff totals · stale-queue health",
    href: "/admin/staff-rollup",
    icon: UsersRoundIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    kind: "nav",
    id: "nav-catalog",
    label: "Catalog",
    hint: "Reference data (read-only)",
    href: "/admin/catalog",
    icon: KeyIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    kind: "nav",
    id: "nav-audit",
    label: "Audit",
    hint: "Activity ledger — exportable",
    href: "/admin/audit",
    icon: ScrollTextIcon,
    group: "Navigate",
    superadminOnly: true,
  },
  {
    kind: "nav",
    id: "nav-health",
    label: "Health",
    hint: "Platform glance",
    href: "/admin/health",
    icon: GaugeIcon,
    group: "Navigate",
  },
  {
    kind: "nav",
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

export interface PaletteHospitalProp {
  id: string;
  name: string;
  slug: string;
  state: string;
}

export interface PalettePersonProp {
  id: string;
  fullName: string;
  email: string;
}

export interface CommandPaletteRootProps {
  isSuperadmin: boolean;
  hospitals: ReadonlyArray<PaletteHospitalProp>;
  people: ReadonlyArray<PalettePersonProp>;
}

export function CommandPaletteRoot({ isSuperadmin, hospitals, people }: CommandPaletteRootProps) {
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

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.superadminOnly || isSuperadmin),
    [isSuperadmin],
  );

  // Entity items derived once from props.
  const hospitalItems: CommandHospitalItem[] = useMemo(
    () =>
      hospitals.map((h) => ({
        kind: "hospital",
        id: `h-${h.id}`,
        name: h.name,
        slug: h.slug,
        state: h.state,
        href: `/admin/tenants?focus=${encodeURIComponent(h.id)}`,
      })),
    [hospitals],
  );

  const personItems: CommandPersonItem[] = useMemo(
    () =>
      people.map((p) => ({
        kind: "person",
        id: `p-${p.id}`,
        fullName: p.fullName,
        email: p.email,
        href: `/admin/people?q=${encodeURIComponent(p.email)}`,
      })),
    [people],
  );

  // Apply the query. With no query, show nav items only — entity
  // search needs intent (typing) to avoid drowning navigation.
  const filtered: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...navItems];

    const navMatches = navItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    );

    const hospitalMatches = hospitalItems
      .filter((item) => item.name.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q))
      .slice(0, 8);

    const personMatches = personItems
      .filter(
        (item) => item.fullName.toLowerCase().includes(q) || item.email.toLowerCase().includes(q),
      )
      .slice(0, 8);

    return [...navMatches, ...hospitalMatches, ...personMatches];
  }, [query, navItems, hospitalItems, personItems]);

  // Group for rendering. Maintains the order: Navigate → Sensitive →
  // Hospitals → People.
  const grouped = useMemo(() => {
    const navGroup = filtered.filter((i): i is CommandNavItem => i.kind === "nav");
    const navByGroup = new Map<CommandNavItem["group"], CommandNavItem[]>();
    for (const item of navGroup) {
      const list = navByGroup.get(item.group) ?? [];
      list.push(item);
      navByGroup.set(item.group, list);
    }
    const hospitalGroup = filtered.filter((i): i is CommandHospitalItem => i.kind === "hospital");
    const personGroup = filtered.filter((i): i is CommandPersonItem => i.kind === "person");
    return { navByGroup, hospitalGroup, personGroup };
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
              <div className="border-border flex items-center gap-3 border-b px-4 py-3">
                <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <label htmlFor={inputId} className="sr-only">
                  Search workspace
                </label>
                <ComboboxPrimitive.Input
                  id={inputId}
                  placeholder="Jump to a section, hospital, or person…"
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
                <ComboboxPrimitive.Empty className="text-muted-foreground px-3 py-8 text-center text-[13px]">
                  No matches for &ldquo;{query}&rdquo;.
                </ComboboxPrimitive.Empty>

                {/* Navigate group */}
                {grouped.navByGroup.get("Navigate") &&
                grouped.navByGroup.get("Navigate")!.length > 0 ? (
                  <NavGroup
                    label="Navigate"
                    items={grouped.navByGroup.get("Navigate")!}
                    onSelect={handleSelect}
                  />
                ) : null}

                {/* Sensitive actions group */}
                {grouped.navByGroup.get("Sensitive actions") &&
                grouped.navByGroup.get("Sensitive actions")!.length > 0 ? (
                  <NavGroup
                    label="Sensitive actions"
                    items={grouped.navByGroup.get("Sensitive actions")!}
                    onSelect={handleSelect}
                  />
                ) : null}

                {/* Entity groups — only when query non-empty */}
                {grouped.hospitalGroup.length > 0 ? (
                  <EntityGroup label="Hospitals" Icon={BuildingIcon}>
                    {grouped.hospitalGroup.map((item) => (
                      <ComboboxPrimitive.Item
                        key={item.id}
                        value={item}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13.5px] outline-none",
                          "data-highlighted:bg-muted",
                        )}
                      >
                        <BuildingIcon
                          className="text-muted-foreground group-data-highlighted:text-foreground size-4 shrink-0"
                          aria-hidden
                        />
                        <span className="flex flex-1 flex-col text-left">
                          <span className="text-foreground font-medium">{item.name}</span>
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {item.slug} · {item.state}
                          </span>
                        </span>
                        <ArrowRightIcon
                          className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-data-highlighted:opacity-100"
                          aria-hidden
                        />
                      </ComboboxPrimitive.Item>
                    ))}
                  </EntityGroup>
                ) : null}

                {grouped.personGroup.length > 0 ? (
                  <EntityGroup label="People" Icon={UserIcon}>
                    {grouped.personGroup.map((item) => (
                      <ComboboxPrimitive.Item
                        key={item.id}
                        value={item}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13.5px] outline-none",
                          "data-highlighted:bg-muted",
                        )}
                      >
                        <UserIcon
                          className="text-muted-foreground group-data-highlighted:text-foreground size-4 shrink-0"
                          aria-hidden
                        />
                        <span className="flex flex-1 flex-col text-left">
                          <span className="text-foreground font-medium">{item.fullName}</span>
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {item.email}
                          </span>
                        </span>
                        <ArrowRightIcon
                          className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-data-highlighted:opacity-100"
                          aria-hidden
                        />
                      </ComboboxPrimitive.Item>
                    ))}
                  </EntityGroup>
                ) : null}
              </ComboboxPrimitive.List>

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

/* ────────────────────────────────────────────────────────────────── */

function NavGroup({
  label,
  items,
  onSelect,
}: {
  label: CommandNavItem["group"];
  items: ReadonlyArray<CommandNavItem>;
  onSelect: (item: CommandNavItem) => void;
}) {
  return (
    <ComboboxPrimitive.Group items={items}>
      <ComboboxPrimitive.GroupLabel
        className={cn(
          "text-muted-foreground px-3 pt-3 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase",
          label === "Sensitive actions" && "text-amber-700 dark:text-amber-400",
        )}
      >
        {label}
      </ComboboxPrimitive.GroupLabel>
      {items.map((item) => (
        <ComboboxPrimitive.Item
          key={item.id}
          value={item}
          onClick={() => onSelect(item)}
          className={cn(
            "group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13.5px] outline-none",
            "data-highlighted:bg-muted",
            item.sensitive && "data-highlighted:bg-amber-50 dark:data-highlighted:bg-amber-950/30",
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
            <span className="text-muted-foreground ml-2 text-[12.5px]">{item.hint}</span>
          </span>
          <ArrowRightIcon
            className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-data-highlighted:opacity-100"
            aria-hidden
          />
        </ComboboxPrimitive.Item>
      ))}
    </ComboboxPrimitive.Group>
  );
}

function EntityGroup({
  label,
  children,
}: {
  label: string;
  Icon: typeof BuildingIcon;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground px-3 pt-3 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}
