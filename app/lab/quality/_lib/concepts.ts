import type { PickOption } from "../../_components/v2/fields";
import type { PlanComponent } from "@/lib/lab/qc-plan-form";

import { conceptDef } from "@/lib/facts/project/shared";

/**
 * Component options for the pickers that replaced the raw concept-id fields (field kit, 5.12): the lab's
 * components by name with unit and section, plus any id already stored on the record (named from the catalogue),
 * so editing an old record never shows or loses an id.
 */
export function conceptOptions(
  components: readonly PlanComponent[],
  stored: readonly string[] = [],
): PickOption[] {
  const out: PickOption[] = components.map((c) => ({
    value: c.conceptId,
    label: c.name,
    detail: [c.unit, c.section].filter(Boolean).join(" · ") || undefined,
  }));
  for (const id of new Set(stored))
    if (!out.some((o) => o.value === id))
      out.push({ value: id, label: conceptDef(id)?.display ?? id });
  return out;
}
