/**
 * The "More" group at the foot of the Clinics & schedule rail (ADR 0514): the other hospital-admin pages, now that
 * the old admin frame steps aside on this workspace. The page names come from the admin registry
 * (app/hospital-admin/_lib/features.ts); only the heading and the rail's accessible name are new. The CSO signs;
 * Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const CLINICS_MORE_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const CS_MORE = {
  title: "More",
  aria: "Other admin pages",
} as const;
