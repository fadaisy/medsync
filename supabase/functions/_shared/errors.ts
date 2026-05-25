/**
 * Typed responses for Edge Functions.
 *
 * Every function returns one of these. Status codes are explicit; bodies are
 * a consistent { ok, error?, data? } envelope so the caller can branch
 * without inspecting status alone.
 */

import { corsHeaders } from "./cors.ts";

interface ResponseInit {
  origin: string | null;
  /** Extra response header (e.g. X-Request-Id correlation). */
  requestId?: string;
}

function jsonResponse(body: unknown, status: number, init: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(init.origin),
      ...(init.requestId ? { "X-Request-Id": init.requestId } : {}),
    },
  });
}

export function ok<T>(data: T, init: ResponseInit): Response {
  return jsonResponse({ ok: true, data }, 200, init);
}

export function badRequest(message: string, init: ResponseInit, details?: unknown): Response {
  return jsonResponse({ ok: false, error: { code: "bad_request", message, details } }, 400, init);
}

export function unauthorized(init: ResponseInit, message = "Authentication required"): Response {
  return jsonResponse({ ok: false, error: { code: "unauthorized", message } }, 401, init);
}

export function forbidden(init: ResponseInit, message = "Forbidden"): Response {
  return jsonResponse({ ok: false, error: { code: "forbidden", message } }, 403, init);
}

export function conflict(message: string, init: ResponseInit): Response {
  return jsonResponse({ ok: false, error: { code: "conflict", message } }, 409, init);
}

export function notFound(init: ResponseInit, message = "Not found"): Response {
  return jsonResponse({ ok: false, error: { code: "not_found", message } }, 404, init);
}

export function serverError(message: string, init: ResponseInit): Response {
  return jsonResponse({ ok: false, error: { code: "server_error", message } }, 500, init);
}

export function methodNotAllowed(init: ResponseInit): Response {
  return jsonResponse(
    { ok: false, error: { code: "method_not_allowed", message: "POST only" } },
    405,
    init,
  );
}
