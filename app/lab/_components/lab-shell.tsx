import type { LabNavEntry } from "./lab-nav";
import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { ReactNode } from "react";

import { sentenceCase, WorkspaceShell } from "@/components/medsync/workspace-shell";
import { LAB } from "@/content/lab";
import { LabCrumb, LabPhoneNav, LabSidebarNav } from "./lab-nav";

/**
 * The laboratory workspace shell (Lab Phase 0 §5.2), drawn by the shared workspace shell (ADR
 * 0229): the cadre and section in the top bar, the registered items in the sidebar.
 */
export { sentenceCase };

export function LabShell({
  scope,
  sectionName,
  nav,
  children,
}: {
  scope: LabTechScope;
  sectionName: string | null;
  nav: readonly LabNavEntry[];
  children: ReactNode;
}) {
  return (
    <WorkspaceShell
      hospitalName={scope.hospitalName}
      place={LAB.place}
      homeHref="/lab"
      navLabel="Laboratory"
      groupLabel={LAB.nav.label}
      sidebarNav={<LabSidebarNav items={nav} />}
      phoneNav={<LabPhoneNav items={nav} />}
      crumb={<LabCrumb items={nav} />}
      who={[sentenceCase(scope.cadreName), sectionName].filter(Boolean).join(" · ")}
      userName={scope.fullName ?? scope.userEmail}
    >
      {children}
    </WorkspaceShell>
  );
}
