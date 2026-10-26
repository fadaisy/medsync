import { REASONS } from "@/app/patient/book/_lib/booking";

/** What a visit is for, by its reason's title; the department when the reason is not one of Appendix A's. */
export const reasonTitle = (v: { reason: string; departmentName: string }) =>
  REASONS.find((r) => r.value === v.reason)?.title ?? v.departmentName;
