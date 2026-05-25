/* eslint-disable @typescript-eslint/no-explicit-any --
 * The supabase-js shim is intentionally `any` until we generate
 * Database types. See the file header for context.
 */

/**
 * Ambient declarations so `tsc --noEmit` can typecheck the Deno-side
 * Edge Functions without resolving their URL / npm: / jsr: imports.
 *
 * What this enables (the value):
 *   - cross-file named-import checks against our own `_shared/`
 *     modules, which is the bug class that caused the May 2026
 *     BOOT_ERROR (a missing `notFound` export).
 *   - audit action / target_kind union validation in `sa-audit.ts`,
 *     so typos can't ship to the sa_audit_log CHECK constraint.
 *   - implicit-any catches in inline callbacks.
 *
 * What this doesn't enable (yet):
 *   - column-name checking inside supabase-js `.select("a, b")` calls.
 *     supabase-js infers shapes from a Database<…> type that we don't
 *     yet generate. Until we run `supabase gen types typescript`, the
 *     client + return shapes are typed as `any` here — generated types
 *     can replace this shim without changing any call sites.
 */

declare module "npm:@supabase/supabase-js@2.106.1" {
  // Loose shims: until we wire generated Database types, supabase-js
  // gives back GenericStringError for every column accessed via a
  // select-string, which is pure noise. The runtime behaviour is
  // unaffected — Deno resolves the real npm package at boot.
  export type SupabaseClient = any;
  export type User = any;
  export function createClient(url: string, key: string, opts?: unknown): any;
}
declare module "npm:zod@4.4.3" {
  export * from "zod";
}
declare module "npm:*";
declare module "jsr:*";
declare module "https://*";

/**
 * Minimal Deno global surface used by these functions. Add to this
 * shape only as the codebase grows — do NOT pull a third-party
 * `@types/deno` shim; those tend to be incomplete or stale.
 */
declare namespace Deno {
  export interface ServeHandler {
    (request: Request): Response | Promise<Response>;
  }
  export function serve(handler: ServeHandler): void;
  export const env: {
    get(key: string): string | undefined;
  };
}
