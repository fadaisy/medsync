import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { SmsSender } from "@/lib/notifications/sink";
import { sql } from "drizzle-orm";

import { decrypt } from "@/lib/encryption";
import { createAfricasTalkingSender } from "@/lib/notifications/africastalking";
import { q } from "@/lib/pharmacy/wards/sql";

/**
 * The pharmacy's SMS transport (MS-3): the repository's provider, or null where it is not configured, and
 * always null under test. The stores take it injected and never read the environment.
 */
export const smsSender = (): SmsSender | null =>
  process.env.NODE_ENV === "test" ? null : createAfricasTalkingSender();

/**
 * The hospital's own account from Set-up › Messages (Africa's Talking: "Provider" is the account username). A saved,
 * disconnected account sends nothing; with none saved the repository's account stands.
 */
export async function hospitalSmsSender(
  d: EmrDb | EmrTx,
  hospitalId: string,
): Promise<SmsSender | null> {
  if (process.env.NODE_ENV === "test") return null;
  const [p] = await q<{ name: string; key: string; sender: string; connected: boolean }>(
    d,
    sql`SELECT name, api_key_encrypted AS key, sender_id AS sender, connected FROM public.pharmacy_sms_provider
         WHERE hospital_id = ${hospitalId}::uuid`,
  );
  if (!p) return smsSender();
  if (!p.connected) return null;
  return createAfricasTalkingSender({
    username: p.name,
    apiKey: decrypt(p.key),
    senderId: p.sender,
    multipart: true,
  });
}
