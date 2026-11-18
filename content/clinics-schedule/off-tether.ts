/**
 * Clinics & schedule: what the workspace says about clinics it does not list because their department is off
 * Tether (Departments owns "Live on Tether"; ADR 0525). Draft wording, kept apart from the signed copy file; the
 * CSO signs, Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const OFF_TETHER_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const OFF_TETHER = {
  one: "{name} is not shown here because its department, {depts}, is off Tether.",
  many: "{n} clinics are not shown here because their departments are off Tether: {depts}.",
  fix: "Set the department live in Departments to bring them back as they were.",
  open: "Open Departments",
  /** The clinic editor's department picker lists live departments only. */
  pickerHint: "Only departments that are live on Tether are listed.",
  noLive:
    "No department is live on Tether yet. Set one live in Departments before adding a clinic.",
} as const;
