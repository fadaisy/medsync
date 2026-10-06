import type { Domain } from "@/lib/design/domains";
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  ClockIcon,
  FlaskConicalIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

/** The glyph of each NCD screen (sidebar, page title tile). */
export const ICONS = {
  today: CalendarDaysIcon,
  patients: UsersIcon,
  enrol: UserPlusIcon,
  recall: PhoneIcon,
  reviews: CalendarCheckIcon,
  dashboard: ChartColumnIcon,
  leading: ActivityIcon,
  review: FlaskConicalIcon,
  overdue: ClockIcon,
  quality: ShieldCheckIcon,
  exchange: ArrowLeftRightIcon,
  admin: SlidersHorizontalIcon,
} as const;
export type NavIcon = keyof typeof ICONS;

/**
 * Where each NCD screen sits in Chroma's place system (DESIGN-medsync.md › Place): the clinic floor is
 * operations (plum), people are patients (sky), clinical review and outcomes are clinical (iris),
 * stewardship is admin (slate). Colour says where you are, never how a patient is.
 */
export const PLACE: Record<NavIcon, Domain> = {
  today: "operations",
  patients: "patients",
  enrol: "patients",
  recall: "patients",
  reviews: "clinical",
  dashboard: "clinical",
  leading: "clinical",
  review: "clinical",
  overdue: "clinical",
  quality: "admin",
  exchange: "admin",
  admin: "admin",
};
