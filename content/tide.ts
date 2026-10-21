/**
 * Strings MedSync Tide changes (prompt Law 4, Appendix A). Draft until the CSO signs; nothing here is clinical.
 */
export const TIDE_COPY = {
  status: "draft" as "draft" | "signed",
  signedBy: null as string | null,
  signedOn: null as string | null,
  /** D-TW-04: the red pill on patient and public routes ("Emergency" stays on staff routes). */
  help: "Help",
  helpLabel: "Help, emergency",
} as const;
