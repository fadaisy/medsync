import type { NavIcon } from "./places";
import type { Domain } from "@/lib/design/domains";
import type { Capability } from "@/lib/ncdreg/capabilities";

import { PLACE } from "./places";

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
        domain: PLACE.today,
        caps: ["person_search"],
        count: "today",
        exact: true,
      },
      {
        href: "/ncd/patients",
        label: "Patients",
        icon: "patients",
        domain: PLACE.patients,
        caps: ["person_search"],
        count: "patients",
      },
      {
        href: "/ncd/recall",
        label: "Recall",
        icon: "recall",
        domain: PLACE.recall,
        caps: ["recall_work"],
        count: "recall",
      },
      {
        href: "/ncd/reviews",
        label: "Reviews due",
        icon: "reviews",
        domain: PLACE.reviews,
        caps: ["person_search"],
      },
      {
        href: "/ncd/dashboard",
        label: "Dashboard",
        icon: "dashboard",
        domain: PLACE.dashboard,
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
        domain: PLACE.leading,
        caps: ["own_panel"],
      },
      {
        href: "/ncd/my?list=review_due",
        label: "Review due",
        icon: "review",
        domain: PLACE.review,
        caps: ["own_panel"],
      },
      {
        href: "/ncd/my?list=overdue",
        label: "Overdue",
        icon: "overdue",
        domain: PLACE.overdue,
        caps: ["own_panel"],
      },
    ],
  },
  {
    group: "Stewardship",
    items: [
      {
        href: "/ncd/quality",
        label: "Data quality",
        icon: "quality",
        domain: PLACE.quality,
        caps: ["data_quality", "merge_request", "merge_approve"],
        count: "queries",
      },
      {
        href: "/ncd/exchange",
        label: "Exchange",
        icon: "exchange",
        domain: PLACE.exchange,
        caps: ["export_request", "export_approve", "aggregate_export", "legacy_entry"],
      },
      {
        href: "/ncd/admin",
        label: "Administration",
        icon: "admin",
        domain: PLACE.admin,
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
