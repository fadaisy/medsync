import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry init. Runs once per browser page load.
 *
 * Note: PII scrubbing on the client uses Sentry's own `sendDefaultPii: false`
 * + minimal `beforeSend` because lib/logger imports `server-only` and can't
 * be loaded here. The patterns are duplicated; keep them in sync if either
 * side adds a new PII field.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    sendDefaultPii: false,
    integrations: [],
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      if (event.request?.cookies) event.request.cookies = { _redacted: "true" };
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
