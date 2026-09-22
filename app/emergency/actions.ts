"use server";

import type { EtaBand, TransportMode } from "@/supabase/functions/_shared/pre-arrival";
import type { SubmissionAudience, Tier } from "@/supabase/functions/_shared/symptom-catalog/types";

import { callEdgePublic } from "@/lib/supabase/edge";

/**
 * The Emergency Pathway's three writes (PRD MS-PRD-SYM-001 §8.3–§8.4, §9.6;
 * ADR 0098). Every one works signed OUT: `callEdgePublic` forwards a session
 * JWT when there is one and the anon key otherwise, and the functions treat
 * the caller as optional. Validation lives in the functions (Zod); this file
 * is transport plus the result shapes the client branches on. Nothing here
 * logs a phone, a coordinate or the reporter token.
 */

export interface PreArrivalInput {
  facility_id: string;
  submission_id?: string;
  subject: {
    audience: SubmissionAudience;
    age_band?: string;
    sex?: "female" | "male" | "unknown";
    pregnant?: boolean;
  };
  red_flags: string[];
  tier: Tier;
  isolation_flag: boolean;
  onset_at?: string;
  last_known_well_at?: string;
  transport_mode: TransportMode;
  eta_band: EtaBand;
  callback_phone?: string;
  share_location?: { lat: number; lng: number };
  device_hash: string;
}

export interface PreArrivalReceipt {
  pre_arrival_id: string;
  token: string;
  status: string;
  facility: {
    name: string;
    emergency_phone: string | null;
    emergency_sms_number: string | null;
    directions: string | null;
  };
  sms_fallback_body: string | null;
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string | null; status: number };

export async function createPreArrivalAction(
  input: PreArrivalInput,
): Promise<ActionResult<PreArrivalReceipt>> {
  const r = await callEdgePublic<{ data?: PreArrivalReceipt }>(
    "pt-create-pre-arrival",
    { ...input },
    "emergency",
  );
  if (!r.ok) return { ok: false, message: r.error, code: r.code, status: r.status };
  if (!r.data?.data) return { ok: false, message: "No receipt came back.", code: null, status: 0 };
  return { ok: true, data: r.data.data };
}

export interface PreArrivalView {
  status: string;
  acknowledged_at: string | null;
  ready_at: string | null;
  arrived_at: string | null;
  expires_at: string;
  facility: {
    name: string | null;
    emergency_phone: string | null;
    emergency_sms_number: string | null;
    directions: string | null;
  };
}

export async function preArrivalStatusAction(input: {
  pre_arrival_id: string;
  token?: string;
  action?: "cancel" | "arrived";
}): Promise<ActionResult<PreArrivalView>> {
  const r = await callEdgePublic<{ data?: PreArrivalView }>(
    "pt-pre-arrival-status",
    { ...input },
    "emergency",
  );
  if (!r.ok) return { ok: false, message: r.error, code: r.code, status: r.status };
  if (!r.data?.data) return { ok: false, message: "No status came back.", code: null, status: 0 };
  return { ok: true, data: r.data.data };
}

/** Best effort (contact id only, never a number): a failure is logged by the transport and ignored. */
export async function emergencyEventAction(input: {
  event: "interrupt_shown" | "declined" | "call_tapped";
  contact_id?: string;
  item_key?: string;
  submission_id?: string;
}): Promise<void> {
  await callEdgePublic("pt-emergency-event", { ...input }, "emergency");
}
