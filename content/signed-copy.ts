/**
 * Clinical-safety wording carries a status (Lab Phase 0 CF-3, Pharmacy Phase 0 CS-5). A workspace
 * whose safety wording is `draft` stays off in production; the CSO signs by setting status
 * "signed" with signedBy and signedOn.
 */
export interface SignedCopy {
  status: "draft" | "signed";
  signedBy: string | null;
  signedOn: string | null;
}
