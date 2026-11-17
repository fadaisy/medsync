import type { ClientHospitalScope } from "./scope-provider";
import type { AdminNavGroup } from "@/lib/hospital-admin/admin-nav";
import type { ReactNode } from "react";
import Link from "next/link";

import { AdminFrame } from "@/components/hospital-admin/admin-frame";
import { GuideProvider } from "@/components/hospital-admin/guide/guide-provider";
import { ADMIN_NAV } from "@/content/hospital-admin/admin-nav";
import { FEATURE_AREAS, featurePath } from "../_lib/features";
import { HospitalCommandPalette } from "./hospital-command-palette";
import { HospitalScopeProvider } from "./scope-provider";

/** Placeholders and the index stay out of ⌘K: nothing on the menu leads to an empty page (ADR 0520). */
const OFF_MENU = new Set(["", "admins", "audit"]);

/**
 * Hospital-admin workspace shell (ADR 0520): the scope provider every admin page reads, around the Tether desk
 * frame with the one admin menu. Clinics & schedule draws its own desk with the same menu, so the frame steps
 * aside there (ADR 0514). The new-admin guide (ADR 0522) wraps both, so a walkthrough crosses between them.
 */
export function HospitalShell({
  scope,
  userName,
  guideKey,
  tether,
  groups,
  children,
}: {
  scope: ClientHospitalScope;
  userName: string;
  /** The guide's per-person key in this browser: a hash of the user's id (ADR 0522). */
  guideKey: string;
  tether: boolean;
  groups: readonly AdminNavGroup[];
  children: ReactNode;
}) {
  const paletteEntries = FEATURE_AREAS.filter(
    (f) => !OFF_MENU.has(f.slug) && !(tether && f.slug === "intake"),
  ).map((f) => ({
    id: `nav-${f.slug}`,
    label: f.label,
    hint: f.hint,
    href: featurePath(f.slug),
    iconKey: f.iconKey,
  }));

  return (
    <HospitalScopeProvider scope={scope}>
      <GuideProvider userKey={guideKey}>
        <AdminFrame
          hospitalName={scope.hospitalName}
          userName={userName}
          groups={groups}
          top={
            <>
              <span data-tour="search">
                <HospitalCommandPalette navEntries={paletteEntries} />
              </span>
              <Link
                href="/sign-out"
                className="text-muted-foreground hover:text-foreground ml-3 text-[13px]"
              >
                {ADMIN_NAV.signOut}
              </Link>
            </>
          }
        >
          {children}
        </AdminFrame>
      </GuideProvider>
    </HospitalScopeProvider>
  );
}
