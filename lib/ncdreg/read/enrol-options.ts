/** The code lists the enrolment form offers (client-safe, from the standard). */
import {
  ALCOHOL,
  KNOWN_CVD,
  REFERRAL_SOURCE,
  TOBACCO,
  WHERE_FIRST_DIAGNOSED,
} from "../standard/code-lists";

const pairs = (l: { codes: readonly { code: string; label: string }[] }) =>
  l.codes.map((c) => [c.code, c.label] as const);
export const CODE_LISTS_FOR_ENROL = {
  tobacco: pairs(TOBACCO),
  alcohol: pairs(ALCOHOL),
  knownCvd: pairs(KNOWN_CVD),
  whereFirst: pairs(WHERE_FIRST_DIAGNOSED),
  referral: pairs(REFERRAL_SOURCE),
};
export type EnrolOptions = typeof CODE_LISTS_FOR_ENROL;
