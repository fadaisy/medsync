import { permanentRedirect } from "next/navigation";

/**
 * Admins moved into People (ADR 0520 phase 2): the placeholder is gone and its address answers 308 to the Admins
 * tab, where the hospital's admins are listed from `user_roles` and `hospital_admin_roster`.
 */
export default function AdminsPage(): never {
  permanentRedirect("/hospital-admin/staff?tab=admins");
}
