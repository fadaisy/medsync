import type { SectionHours } from "../_lib/model";
import type { useMenuAction } from "@/components/lab/test-menu/use-menu-action";

import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";

/** The test menu's one pending flag and message (components/lab/test-menu), shared by the page's parts. */
export type Act = ReturnType<typeof useMenuAction>;

/** A section's hours in words, as the section list and Hours by section print them. */
export function sectionHoursWords(h: SectionHours): string {
  switch (h.kind) {
    case "none":
      return LAB_ADMIN.hours.none;
    case "unset":
      return LAB_ADMIN.hours.notSet;
    case "24h":
      return C.hours["24h"];
    case "scheduled":
      return h.note || C.hours.scheduled;
    case "mixed":
      return LAB_ADMIN.menu.mixed;
  }
}
