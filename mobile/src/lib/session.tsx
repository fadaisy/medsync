import type { AuthSession } from "@supabase/supabase-js";
import type { PropsWithChildren } from "react";
import { createContext, use, useEffect, useState } from "react";

import { unregisterPushToken } from "@/lib/push";
import { supabase } from "@/lib/supabase";

/**
 * Three states, deliberately. "Still checking" is NOT "signed out".
 *
 * Collapsing the two is what makes an app show its welcome screen to a patient
 * who is already signed in, on every cold start — and on the connections this
 * app is built for that flash lasts long enough to read as having been logged
 * out. So `loading` is a value callers must handle, not a default they fall
 * into.
 */
export type SessionStatus = "loading" | "signedIn" | "signedOut";

export type SessionValue = {
  status: SessionStatus;
  /**
   * The live session, or null. Screens calling an Edge Function need
   * `session.access_token` for the Authorization header; reads go straight to
   * PostgREST under RLS and need nothing from here.
   */
  session: AuthSession | null;
  /** Ends the session on this device. The gate follows on its own. */
  signOut: () => Promise<void>;
  /**
   * Gate H (ADR 0094): the active data-processing text this patient has not
   * accepted, or null — nothing due, still checking, or the check failed.
   * `(app)/_layout.tsx` closes the workspace on it; `consent.tsx` opens it.
   */
  consentDue: ConsentDue | null;
  /** The consent screen recorded the acceptance; the gate reopens. */
  consentAccepted: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Module scope rather than a `useCallback`: it closes over nothing, so a stable
 * identity is free and does not depend on the React Compiler memoising the
 * provider.
 *
 * No error path, and that is not laziness. Supabase clears the stored session
 * even when the server call fails — a 401, a 403, a dead connection — so there
 * is nothing true left to tell a patient: on this device they are signed out
 * either way, and `onAuthStateChange` has already moved the gate.
 */
async function signOut(): Promise<void> {
  // The push token goes first (Gate E): after signOut the JWT is gone and RLS
  // refuses the delete, and the next person on this phone would get this
  // account's messages.
  await unregisterPushToken();
  await supabase.auth.signOut();
}

export function SessionProvider({ children }: PropsWithChildren) {
  // `undefined` = not checked yet. `null` = checked, nobody is signed in.
  // One variable rather than a `session` + `loading` pair, because two
  // variables are two things a caller can read in the wrong order.
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  // Keyed by the user it was read for, and DERIVED below, so a sign-out or a
  // different account signing in clears it without a setState in the effect.
  const [consentFor, setConsentFor] = useState<{ userId: string; due: ConsentDue } | null>(null);

  // Once per signed-in user, not per render. Null while it runs: the
  // workspace mounts and, for the few patients it concerns, gives way to the
  // consent screen when the answer lands — a blank hold on every cold start
  // for everyone would cost more than that one flash for five. A failed read
  // is null too: the web gate is the enforcement; this one mirrors it.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchConsentDue().then(
      (due) => {
        if (live && due) setConsentFor({ userId, due });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [userId]);
  const consentDue = consentFor && consentFor.userId === userId ? consentFor.due : null;

  useEffect(() => {
    let live = true;
    // Subscribe FIRST, and let the listener win over the seed.
    //
    // `getSession()` can await a token refresh, which on an intermittent
    // connection takes seconds. Without this guard a slow seed resolving after
    // a SIGNED_OUT would put the dead session back and hand a signed-out
    // patient the workspace, where every query then fails on RLS.
    let heardFromListener = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      heardFromListener = true;
      if (live) setSession(next);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (live && !heardFromListener) setSession(data.session);
      })
      // Unreadable storage is a real outcome on a full device, and it means
      // exactly "we could not find a session" — not a reason to sit on the
      // splash forever waiting for an answer that is not coming.
      .catch(() => {
        if (live && !heardFromListener) setSession(null);
      });

    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext
      value={{
        status: session === undefined ? "loading" : session ? "signedIn" : "signedOut",
        session: session ?? null,
        signOut,
        consentDue,
        consentAccepted: () => setConsentFor(null),
      }}
    >
      {children}
    </SessionContext>
  );
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) {
    // A screen rendering outside the provider would read as "signed out" and
    // silently show the wrong thing, so fail loudly instead.
    throw new Error(
      "useSession() needs <SessionProvider>, which wraps the app in src/app/_layout.tsx.",
    );
  }
  return value;
}

/* ─── Consent re-acceptance (Gate H, ADR 0094) ────────────────────── */

/** The active `data_processing` row of `consent_versions` — what the screen shows and records. */
export interface ConsentDue {
  version: string;
  body: string;
  bodySha256: string;
  effectiveDate: string;
}

/**
 * The web's `dataProcessingConsent`, from the phone: the active text, and
 * whether a live record on the SAME version and hash exists for this user.
 * A record on other words proves nothing — the handoff's case is five
 * patients whose signup wrote no row at all, and nobody can say what they
 * saw, so nothing is backfilled and they are asked again. Both reads are
 * PostgREST under RLS: `consent_versions` is public, `consent_records` is
 * own rows. Throws on a read error; the provider decides what that means.
 */
async function fetchConsentDue(): Promise<ConsentDue | null> {
  const { data: v, error } = await supabase
    .from("consent_versions")
    .select("version, body, body_sha256, effective_date")
    .eq("consent_type", "data_processing")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) return null;
  const { data: record, error: recordError } = await supabase
    .from("consent_records")
    .select("id")
    .eq("consent_type", "data_processing")
    .eq("version", v.version)
    .eq("consent_text_sha256", v.body_sha256)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (recordError) throw new Error(recordError.message);
  return record
    ? null
    : {
        version: v.version,
        body: v.body,
        bodySha256: v.body_sha256,
        effectiveDate: v.effective_date,
      };
}

/**
 * One `consent_records` row, the way the patient signup writes it. Straight
 * through the client: RLS grants a patient INSERT on their own consent (0002),
 * so this is the one write in the app that needs no Edge Function. The
 * version + hash are the ones just read and shown, never retyped.
 */
export async function acceptConsent(
  due: ConsentDue,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { ok: false, error: "You're signed out. Sign in and try again." };
  const { error } = await supabase.from("consent_records").insert({
    user_id: userId,
    consent_type: "data_processing",
    version: due.version,
    consent_text_sha256: due.bodySha256,
    accepted_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Could not save that. Try again." };
  return { ok: true };
}
