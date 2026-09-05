import type { Metadata } from "next";
import Link from "next/link";
import {
  BuildingIcon,
  HospitalIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";

import { requirePatientScope } from "@/lib/patient/scope";

export const metadata: Metadata = { title: "More · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Patient "More" surface — the catch-all that sits behind the 4th tab.
 *
 * GATE F lands the proper profile + consent centre + settings pages.
 * For now this is a navigation index — every link goes to an existing
 * surface (real) or a placeholder (with clear "coming soon" framing
 * inside).
 */
export default async function PatientMenuPage() {
  const scope = await requirePatientScope();

  return (
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div
        aria-hidden
        className="bg-brand-500/5 dark:bg-brand-400/4 pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-md max-w-full -translate-x-1/2 rounded-full blur-3xl"
      />
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          MedSync · More
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          {scope.fullName ?? scope.userEmail}
        </h1>
        <p className="text-muted-foreground text-[12.5px]">{scope.userEmail}</p>
      </header>

      <nav aria-label="More" className="stagger-children flex flex-col gap-2">
        <MenuLink
          href="/patient/hospitals"
          label="Hospitals"
          sub={scope.primaryHospitalName ?? "Pick your primary hospital"}
          Icon={HospitalIcon}
        />
        <MenuLink
          href="/patient/profile"
          label="Profile"
          sub="Contact, next of kin, language"
          Icon={UserIcon}
        />
        <MenuLink
          href="/patient/consent"
          label="Consent & sharing"
          sub="Who can see what — coming soon"
          Icon={ShieldIcon}
        />
        <MenuLink
          href="/patient/settings"
          label="Settings"
          sub="Notifications, security"
          Icon={SettingsIcon}
        />
        <MenuLink
          href="/patient/care"
          label="My care"
          sub={
            scope.primaryHospitalId
              ? "From your clinical team — coming soon"
              : "Available once you connect to a hospital"
          }
          Icon={BuildingIcon}
        />
      </nav>

      <Link
        href="/sign-out"
        className="border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 tap text-body-s mt-2 inline-flex items-center justify-center gap-2 rounded-xl border p-3 transition-colors"
      >
        <LogOutIcon className="size-4" aria-hidden />
        Sign out
      </Link>
    </div>
  );
}

function MenuLink({
  href,
  label,
  sub,
  Icon,
}: {
  href: string;
  label: string;
  sub: string;
  Icon: typeof UserIcon;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-card hover:bg-muted/30 hover:border-foreground/15 card-lift tap group flex items-center gap-3 rounded-xl border p-3.5"
    >
      <span
        aria-hidden
        className="bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground text-[13.5px] font-medium">{label}</span>
        <span className="text-muted-foreground truncate text-[11.5px]">{sub}</span>
      </span>
      <span
        aria-hidden
        className="text-muted-foreground text-[14px] transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
