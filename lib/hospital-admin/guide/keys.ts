/**
 * The new-admin guide (ADR 0522): the `data-tour` keys of the admin menu. Each menu item is `nav-<slug of its
 * label>`, the same in the admin frame and the Clinics & schedule rail, so a walkthrough finds it on every page.
 * Two items share the label "People" (Clinics & schedule's team view and the hospital's People page): the second,
 * in a group, takes the group's name too (`nav-hospital-people`). Pure and client-safe.
 */
import { CS } from "@/content/clinics-schedule/copy";

export const slug = (t: string) =>
  String(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const VIEW_SLUGS = new Set(Object.values(CS.views).map(slug));

/** A menu item's tour key. `group` is the menu group's label for the items after Clinics & schedule's views. */
export function navTour(label: string, group?: string): string {
  const s = slug(label);
  return group && VIEW_SLUGS.has(s) ? `nav-${slug(group)}-${s}` : `nav-${s}`;
}
