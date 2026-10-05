import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { Avatar } from "@/components/medsync/avatar";
import { SIDEBAR_CLASS, SidebarGroupLabel, SidebarWorkspace } from "@/components/medsync/sidebar-nav";
import { facilityStatus } from "@/lib/ncdreg/admin";
import { can } from "@/lib/ncdreg/context";
import { sidebarCounts } from "@/lib/ncdreg/read/counts";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { NcdNavItem } from "./_components/nav-item";
import { NoticeBanner } from "./_components/notice-banner";
import { OutboxProvider, SignOutButton } from "./_components/outbox-provider";
import { NAV } from "./_lib/nav";

export const metadata: Metadata = { title: "NCD registry", robots: { index: false, follow: false }, manifest: "/ncd/manifest.webmanifest" };

/** NCDSync shell (§11.3): sidebar in three groups shown by capability, one banner region, the content. */
export default async function NcdLayout({ children }: { children: ReactNode }) {
  const { ctx, hospitalName, fullName } = await requireNcdScope();
  const [status, counts] = await Promise.all([facilityStatus(ctx), sidebarCounts(ctx)]);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(ctx, ...i.caps)) })).filter((g) => g.items.length);
  return (
    <OutboxProvider>
      <div className="bg-background text-foreground flex min-h-svh w-full">
        <aside aria-label="NCD registry navigation" className={`${SIDEBAR_CLASS} print:hidden`}>
          <div className="flex flex-col gap-1.5 p-2">
            <SidebarWorkspace name={hospitalName} sub="NCD registry" href="/ncd" />
          </div>
          <nav className="flex-1 overflow-y-auto px-2 pb-2">
            {groups.map((g) => (
              <div key={g.group}>
                <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <NcdNavItem href={i.href} label={i.label} icon={i.icon} domain={i.domain} exact={i.exact} count={i.count ? counts[i.count] : undefined} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-sidebar-border flex items-center gap-2 border-t p-3">
            <Avatar name={fullName} hue="sky" size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-label text-foreground truncate">{fullName}</p>
              <SignOutButton />
              <p className="text-muted-foreground truncate text-[11px]">{ctx.roles.map((r) => r.replace(/_/g, " ")).join(", ")}</p>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border flex h-12 items-center justify-between gap-3 border-b px-4 sm:px-6 lg:hidden print:hidden">
            <Link href="/ncd" className="font-display text-body-m font-semibold">
              NCD registry
            </Link>
            <SignOutButton />
          </header>
          <NoticeBanner status={status} canManageDemo={can(ctx, "demo_data_manage")} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </OutboxProvider>
  );
}
