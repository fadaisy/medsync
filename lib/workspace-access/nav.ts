/**
 * A workspace's navigation registry (ADR 0229; Lab NV-1..NV-3, Pharmacy NV-P1). The sidebar renders
 * only what is registered and visible to the viewer; a page that does not exist is never listed and
 * nothing is shown as "soon".
 */
export interface NavItem<Id extends string, P extends string, F = undefined> {
  id: Id;
  label: string;
  href: string;
  order: number;
  /** Match the index route exactly, so a sibling route does not light it. */
  exact: boolean;
  /** Items in a group sit under their own label (the lab's Set-up). */
  group?: string;
  /** `flags`: the workspace's feature flags, for items that ship behind one (Lab Phase 1). */
  visibleFor: (permissions: ReadonlySet<P>, flags: F) => boolean;
}

export function navFor<Id extends string, P extends string, F = undefined>(
  items: readonly NavItem<Id, P, F>[],
  permissions: ReadonlySet<P>,
  flags?: F,
): NavItem<Id, P, F>[] {
  return items
    .filter((i) => i.visibleFor(permissions, flags as F))
    .sort((a, b) => a.order - b.order);
}
