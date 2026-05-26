"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

/**
 * Client-side mirror of the server's HospitalAdminScope. The shell
 * passes the resolved scope down via this provider so client features
 * can read it without re-querying — and, crucially, without anyone
 * making up a hospital_id from URL params.
 *
 * Only carries the fields safe to ship to the browser: hospital
 * identity + the admin's role designation. Sensitive data (encrypted
 * PII, audit context) stays server-side.
 */

export interface ClientHospitalScope {
  hospitalId: string;
  hospitalSlug: string;
  hospitalName: string;
  level: string;
  state: string;
  designation: "primary" | "backup" | null;
}

const ScopeContext = createContext<ClientHospitalScope | null>(null);

export function HospitalScopeProvider({
  scope,
  children,
}: {
  scope: ClientHospitalScope;
  children: ReactNode;
}) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

/**
 * Read the current hospital scope from a client component. Throws if
 * called outside the provider — that's a programmer error, not a
 * runtime "maybe no scope" case (the layout guarantees scope before
 * rendering this tree).
 */
export function useHospitalScope(): ClientHospitalScope {
  const scope = useContext(ScopeContext);
  if (!scope) {
    throw new Error(
      "useHospitalScope() called outside <HospitalScopeProvider>. " +
        "Did you render a hospital-admin component outside the workspace shell?",
    );
  }
  return scope;
}
