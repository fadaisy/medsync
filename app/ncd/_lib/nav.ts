import type { NavIcon } from "../_components/nav-item";
import type { Domain } from "@/lib/design/domains";
import type { Capability } from "@/lib/ncdreg/capabilities";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  domain?: Domain;
  caps: Capability[];
  count?: "today" | "patients" | "recall" | "queries";
  exact?: boolean;
};

/** The three sidebar groups of the preview (§11.3 Shell), each item shown by capability. */
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "NCD registry",
    items: [
      {
        href: "/ncd",
        label: "Today's clinic",
        icon: "today",
        domain: "operations",
        caps: ["person_search"],
        count: "today",
        exact: true,
      },
      {
        href: "/ncd/patients",
        label: "Patients",
        icon: "patients",
        domain: "patients",
        caps: ["person_search"],
        count: "patients",
      },
      {
        href: "/ncd/recall",
        label: "Recall",
        icon: "recall",
        domain: "patients",
        caps: ["recall_work"],
        count: "recall",
      },
      {
        href: "/ncd/reviews",
        label: "Reviews due",
        icon: "reviews",
        domain: "clinical",
        caps: ["person_search"],
      },
      {
        href: "/ncd/dashboard",
        label: "Dashboard",
        icon: "dashboard",
        domain: "admin",
        caps: ["aggregate_view", "report_view"],
      },
    ],
  },
  {
    group: "My patients",
    items: [
      {
        href: "/ncd/my?list=not_leading",
        label: "Not in range at last visit",
        icon: "leading",
        caps: ["own_panel"],
      },
      { href: "/ncd/my?list=review_due", label: "Review due", icon: "review", caps: ["own_panel"] },
      { href: "/ncd/my?list=overdue", label: "Overdue", icon: "overdue", caps: ["own_panel"] },
    ],
  },
  {
    group: "Stewardship",
    items: [
      {
        href: "/ncd/quality",
        label: "Data quality",
        icon: "quality",
        domain: "admin",
        caps: ["data_quality", "merge_request", "merge_approve", "audit_view"],
        count: "queries",
      },
      {
        href: "/ncd/exchange",
        label: "Exchange",
        icon: "exchange",
        domain: "admin",
        caps: ["export_request", "export_approve", "aggregate_export", "legacy_entry"],
      },
      {
        href: "/ncd/admin",
        label: "Administration",
        icon: "admin",
        domain: "admin",
        caps: [
          "condition_catalogue_manage",
          "code_list_manage",
          "demo_data_manage",
          "ncd_role_assign",
          "go_live_request",
          "clinical_safety_approve",
        ],
      },
    ],
  },
];

/** The first screen this person may open, in sidebar order; null when they may open none. */
export function firstAllowedHref(has: (...caps: Capability[]) => boolean): string | null {
  for (const g of NAV) for (const item of g.items) if (has(...item.caps)) return item.href;
  return null;
}
