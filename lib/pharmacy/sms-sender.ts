import "server-only";

import type { SmsSender } from "@/lib/notifications/sink";

import { createAfricasTalkingSender } from "@/lib/notifications/africastalking";

/**
 * The pharmacy's SMS transport (MS-3): the repository's provider, or null where it is not configured, and
 * always null under test. The stores take it injected and never read the environment.
 */
export const smsSender = (): SmsSender | null =>
  process.env.NODE_ENV === "test" ? null : createAfricasTalkingSender();
