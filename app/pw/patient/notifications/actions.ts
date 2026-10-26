"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";

const Ids = z.array(z.string().uuid()).min(1).max(100);

/**
 * Read means acknowledged (F-06): each row goes through pt-ack-notification with the patient's JWT, as the phone's
 * ackNotification does, which also stops the SMS back-up. Best effort per row, like the phone.
 */
export async function ackNotificationsAction(raw: unknown): Promise<void> {
  const parsed = Ids.safeParse(raw);
  if (!parsed.success) return;
  await requirePatientScope();
  await Promise.all(
    parsed.data.map((id) => callEdge("pt-ack-notification", { dispatch_id: id }, "patient-web")),
  );
  revalidatePath("/pw/patient", "layout");
}
