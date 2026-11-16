import type { ReactNode } from "react";
import Link from "next/link";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { HubFrame } from "./_components/hub-frame";

/**
 * Departments and the pages under it. Departments, Emergency and support, and Wards and beds draw their own desk
 * pages (ADR 0521). The pages still in the older look (pharmacy set-up, which stays on MedSync, and the one result
 * path) get a link back to Departments; the old hub title, counts and tabs are gone, so nothing is queried for them.
 */
export default async function ServicesHubLayout({ children }: { children: ReactNode }) {
  await requireHospitalAdminScope();
  const chrome = (
    <nav aria-label="Breadcrumb" className="text-body-s text-muted-foreground">
      <Link
        href="/hospital-admin/departments"
        className="hover:text-foreground underline-offset-2 hover:underline"
      >
        Departments
      </Link>
    </nav>
  );
  return <HubFrame chrome={chrome}>{children}</HubFrame>;
}
