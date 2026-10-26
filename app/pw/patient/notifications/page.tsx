import type { Metadata } from "next";

import { PageHeader } from "@/components/tide/shell";
import { listNotifications } from "@/lib/patient-web/notifications";
import { requirePatientScope } from "@/lib/patient/scope";
import { NotificationList } from "./_components/notification-list";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/**
 * Notifications (F-06, the phone's app/(app)/notifications.tsx): the messages MedSync sent this patient, grouped by
 * day and filterable, each with the action it asks for inside the row.
 */
export default async function NotificationsPage() {
  const scope = await requirePatientScope();
  const items = await listNotifications(scope.userId).catch(() => null);
  const unread = items?.filter((n) => n.unread).length ?? 0;
  return (
    <>
      <PageHeader
        back={{ href: "/patient", label: "Home" }}
        title="Notifications"
        subtitle={unread ? `${unread} new` : "All caught up"}
        unseen={unread}
      />
      <NotificationList items={items} />
    </>
  );
}
