/**
 * A workspace's navigation registry (ADR 0229; Lab NV-1..NV-3, Pharmacy NV-P1). The sidebar renders
 * only what is registered and visible to the viewer; a page that does not exist is never listed and
 * nothing is shown as "soon".
 */
export interface NavItem<Id extends string, P extends string> {
  id: Id;
  label: string;
  href: string;
  order: number;
  /** Match the index route exactly, so a sibling route does not light it. */
  exact: boolean;
  visibleFor: (permissions: ReadonlySet<P>) => boolean;
}

export function navFor<Id extends string, P extends string>(
  items: readonly NavItem<Id, P>[],
  permissions: ReadonlySet<P>,
): NavItem<Id, P>[] {
  return items.filter((i) => i.visibleFor(permissions)).sort((a, b) => a.order - b.order);
}
