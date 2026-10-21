/**
 * The sidebar column itself: `sidebar` ground, 248px, hairline right edge. A plain module, not the
 * "use client" sidebar-nav: a server shell that builds a string from a client export gets the
 * client reference's text, not these classes, and the sidebar shows on phones.
 */
export const SIDEBAR_CLASS =
  "medsync-rail bg-sidebar border-sidebar-border hidden w-[248px] shrink-0 flex-col border-r lg:flex";
