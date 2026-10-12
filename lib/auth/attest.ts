import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { createClient } from "@supabase/supabase-js";
import { and, eq, gte, sql } from "drizzle-orm";

import { pharmacyAttestations } from "@/db/schema/pharmacy-dispensing";
import { env } from "@/lib/env";

/**
 * Second-person attestation (D-PH1-42, ADR 0279, H5). A witness (or a signer) proves who they are by
 * typing their own password and authenticator code on the actor's screen. The server checks them on a
 * throwaway Supabase client that keeps no session and never touches the active session's cookies (ADR
 * 0280's account slots included), then signs that client out locally.
 *
 * Every attempt is a `pharmacy_attestations` row (passed, failed or locked), never a secret: the
 * password and code are neither stored, logged nor returned. Five failures for one witness account in
 * an hour lock that account's attestations until the hour has passed; a locked attempt is recorded
 * without trying. The verifier is injected so the PGlite lane drives the lock and the recording.
 */

export interface VerifyInput {
  email: string;
  password: string;
  code: string;
}
/** The user the password and code belong to, or null when either is wrong. */
export type Verifier = (input: VerifyInput) => Promise<{ userId: string } | null>;

export const ATTEST_MAX_FAILURES = 5;
export const ATTEST_LOCK_MS = 60 * 60_000;

/** Draft staff copy (not in Appendix B). */
export const ATTEST_COPY = {
  failed: "That password or code did not work. The witness types their own.",
  self: "The witness must be someone else.",
  locked: "Too many tries for this witness. Their confirmation is locked for an hour.",
  unknown: "That person cannot confirm here.",
} as const;

export type AttestResult =
  | { ok: true; attestationId: string; attestedAt: Date }
  | { ok: false; attestationId: string; words: string };

/** The real check: a throwaway client, password then TOTP, then signed out on that client only. */
export const supabaseVerifier: Verifier = async ({ email, password, code }) => {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.user) return null;
    const factors = await client.auth.mfa.listFactors();
    const factor = factors.data?.totp.find((f) => f.status === "verified");
    if (!factor) return null;
    const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error || !challenge.data) return null;
    const verified = await client.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code,
    });
    return verified.error ? null : { userId: signIn.data.user.id };
  } catch {
    return null;
  } finally {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
};

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

/**
 * Inside the caller's transaction: serialise attempts for this witness, refuse a locked account
 * without trying, check the password and code, record the outcome. Never throws for a wrong
 * password, so the failed row commits.
 */
export async function attestSecondPerson(
  input: {
    hospitalId: string;
    actorUserId: string;
    witnessUserId: string;
    password: string;
    code: string;
    purpose: "witness" | "signer";
    action: string;
  },
  deps: { tx: EmrTx; now: Date; verify?: Verifier },
): Promise<AttestResult> {
  const { tx, now } = deps;
  const verify = deps.verify ?? supabaseVerifier;
  const self = input.purpose === "witness" && input.witnessUserId === input.actorUserId;
  const record = async (outcome: "passed" | "failed" | "locked") => {
    const [row] = await tx
      .insert(pharmacyAttestations)
      .values({
        hospitalId: input.hospitalId,
        actorUserId: input.actorUserId,
        // 0122 pa_not_self: a witness row never names the actor.
        attesterUserId: self ? null : input.witnessUserId,
        purpose: input.purpose,
        action: input.action,
        method: "password+totp",
        outcome,
        attestedAt: now,
      })
      .returning({ id: pharmacyAttestations.id });
    return row!.id;
  };

  if (self) return { ok: false, attestationId: await record("failed"), words: ATTEST_COPY.self };

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`attest:${input.witnessUserId}`}))`);
  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(pharmacyAttestations)
    .where(
      and(
        eq(pharmacyAttestations.attesterUserId, input.witnessUserId),
        eq(pharmacyAttestations.outcome, "failed"),
        gte(pharmacyAttestations.attestedAt, new Date(now.getTime() - ATTEST_LOCK_MS)),
      ),
    );
  if (Number(n) >= ATTEST_MAX_FAILURES)
    return { ok: false, attestationId: await record("locked"), words: ATTEST_COPY.locked };

  const [user] = rowsOf<{ email: string | null }>(
    await tx.execute(sql`SELECT email FROM auth.users WHERE id = ${input.witnessUserId}::uuid`),
  );
  const who = user?.email
    ? await verify({ email: user.email, password: input.password, code: input.code })
    : null;
  // S58: the factor must be the witness's own: a code that proves the actor (or anyone else) fails.
  if (!who || who.userId !== input.witnessUserId)
    return { ok: false, attestationId: await record("failed"), words: ATTEST_COPY.failed };
  return { ok: true, attestationId: await record("passed"), attestedAt: now };
}
