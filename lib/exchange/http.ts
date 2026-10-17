import "server-only";

/** Bearer token from an Authorization header, or null. */
export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() || null : null;
}

/** Read a body with a hard size cap (EX-2: refused before anything is stored; the sender may retry smaller). */
export async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > maxBytes) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** The SMART token endpoint's own URL, used as the assertion's audience. */
export const tokenAudience = (request: Request) =>
  `${new URL(request.url).origin}/api/exchange/token`;
