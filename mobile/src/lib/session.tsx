import type { AuthSession } from "@supabase/supabase-js";
import type { PropsWithChildren } from "react";
import { createContext, use, useEffect, useState } from "react";

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
  await supabase.auth.signOut();
}

export function SessionProvider({ children }: PropsWithChildren) {
  // `undefined` = not checked yet. `null` = checked, nobody is signed in.
  // One variable rather than a `session` + `loading` pair, because two
  // variables are two things a caller can read in the wrong order.
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

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
