"use client";

import type { StoreSection } from "@/content/pharmacy-store";
import type { NavGroup, NavItem } from "@/lib/pharmacy/derive/store/stats";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Chip } from "@/components/pharmacy/charts/chip";
import { SECTION_LABEL, ST } from "@/content/pharmacy-store";
import { cn } from "@/lib/utils";

/**
 * The section bar (STORE.md §A2, §A3): Overview, then four group menus with counts coloured by the most serious one.
 * Under 760 px it is one select. Esc or a click outside closes a menu, and focus returns to its button.
 */
const hrefOf = (k: NavItem["key"]) =>
  k === "receive" ? "/pharmacy/stock/store?tab=receive" : `?tab=main&section=${k}`;

function Menu({ group, section }: { group: NavGroup; section: StoreSection }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const active = group.items.find((i) => i.key === section);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "focus-visible:ring-primary inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2",
          active ? "bg-tide-lagoon-tint text-teal-900" : "text-foreground hover:bg-ink-50",
        )}
      >
        {active ? `${group.label} · ${active.label}` : group.label}
        {group.count ? <Chip tone={group.tone}>{group.count}</Chip> : null}
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={group.label}
          className="bg-card shadow-card border-ink-100 absolute top-full left-0 z-30 mt-1 flex min-w-[240px] flex-col rounded-xl border p-1"
        >
          {group.items.map((i) => (
            <Link
              key={i.key}
              role="menuitem"
              href={hrefOf(i.key)}
              scroll={false}
              onClick={() => setOpen(false)}
              className={cn(
                "focus-visible:ring-primary text-foreground flex min-h-9 items-center justify-between gap-3 rounded-lg px-3 text-[13.5px] no-underline outline-none focus-visible:ring-2",
                i.key === section ? "bg-tide-lagoon-tint font-semibold" : "hover:bg-ink-50",
              )}
            >
              {i.label}
              {i.count ? <Chip tone={i.tone}>{i.count}</Chip> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SectionBar({ groups, section }: { groups: NavGroup[]; section: StoreSection }) {
  const router = useRouter();
  return (
    <>
      <nav
        aria-label={ST.shell.sectionsLabel}
        className="bg-card shadow-card hidden flex-wrap items-center gap-1 rounded-2xl p-1.5 min-[761px]:flex"
      >
        <Link
          href="?tab=main&section=home"
          scroll={false}
          aria-current={section === "home" ? "page" : undefined}
          className={cn(
            "focus-visible:ring-primary inline-flex h-9 items-center rounded-full px-3 text-[13.5px] font-semibold no-underline outline-none focus-visible:ring-2",
            section === "home"
              ? "bg-tide-lagoon-tint text-teal-900"
              : "text-foreground hover:bg-ink-50",
          )}
        >
          {SECTION_LABEL.home}
        </Link>
        {groups.map((g) => (
          <Menu key={g.key} group={g} section={section} />
        ))}
      </nav>
      <label className="flex flex-col gap-1 min-[761px]:hidden">
        <span className="text-ink-600 text-[12px] font-medium">{ST.shell.selectLabel}</span>
        <select
          value={section}
          onChange={(e) => router.push(hrefOf(e.target.value as NavItem["key"]), { scroll: false })}
          className="bg-card border-ink-300 text-foreground h-10 w-full rounded-full border px-3 text-[14px]"
        >
          <option value="home">{SECTION_LABEL.home}</option>
          {groups.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.items.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.count ? `${i.label} (${i.count})` : i.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </>
  );
}
