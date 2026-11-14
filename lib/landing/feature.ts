import { TETHER_LANDING_COPY_STATUS } from "@/content/tether-landing/copy";
import { TETHER_FAQ_COPY_STATUS } from "@/content/tether-landing/faq";

/**
 * `LANDING_TETHER` (ADR 0477): "1" serves the Tether landing page at `/` (proxy.ts rewrites to `/tether`).
 * Production keeps it off while either copy status is draft, whatever the variable says. Deleted at Step 7.
 */
export function landingTetherOn(
  env: string | undefined = process.env.LANDING_TETHER,
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  if (env !== "1") return false;
  if (vercelEnv !== "production") return true;
  return [TETHER_LANDING_COPY_STATUS, TETHER_FAQ_COPY_STATUS].every((c) => c.status === "signed");
}

/** Paths the Tether build serves in place of the hospital app's page while the landing is on (ADR 0498). */
const TETHER_PAGES: Record<string, string> = {
  "/": "/tether",
  "/sign-in": "/tether/sign-in",
  "/sign-in/mfa": "/tether/sign-in/mfa",
};

/** Where proxy.ts rewrites `pathname` to, or null. The visible address never changes. */
export function tetherRewrite(pathname: string, on: boolean = landingTetherOn()): string | null {
  return on ? (TETHER_PAGES[pathname] ?? null) : null;
}
