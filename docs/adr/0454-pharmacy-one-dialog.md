# ADR 0454 — One pharmacy form dialog

**Status:** Accepted — 27 Oct 2026 (Workspace v2 NavMap build gap).

## Decision

`ReviewDialog`, `ActionDialog` (wards) and `StoreDialog` were three copies of the same centred form dialog. They are now thin wrappers that name their words around `PharmacyDialog` (`app/pharmacy/_components/pharmacy-dialog.tsx`), which wraps `EditorDialog` ([ADR 0161](0161-pop-ups-are-centred-landscape-dialogs.md)). Behaviour is unchanged: the wards' dialogs still do not refresh after a save, because their actions revalidate.
