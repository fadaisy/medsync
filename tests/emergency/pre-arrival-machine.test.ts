import type {
  EtaBand,
  PreArrivalStatus,
  TransportMode,
} from "@/supabase/functions/_shared/pre-arrival";
import { describe, expect, it } from "vitest";

import {
  PRE_ARRIVAL_TRANSITIONS as DRIZZLE_TRANSITIONS,
  canTransition as drizzleCanTransition,
} from "@/db/schema/emergency";
import {
  ACK_TIMEOUT_MS,
  BOARD_ESCALATION_MS,
  canTransition,
  composeFacilitySms,
  ETA_BANDS,
  HOAX_DOWNGRADE_THRESHOLD,
  PRE_ARRIVAL_STATUSES,
  PRE_ARRIVAL_TRANSITIONS,
  RATE_LIMITS,
  SMS_MAX,
  TRANSPORT_MODES,
} from "@/supabase/functions/_shared/pre-arrival";

/**
 * The pre-alert status machine (PRD MS-PRD-SYM-001 §9.2; build prompt Phase 2
 * §5) and the Gate A numbers (ADR 0098). Two copies of the table exist on
 * purpose — Deno cannot import Drizzle and Next cannot import a `.ts`
 * re-export — so the last test holds them deep-equal.
 */

const LIVE: PreArrivalStatus[] = ["sent", "seen", "ready"];
const CLOSED: PreArrivalStatus[] = ["arrived", "cancelled", "expired", "not_arriving", "hoax"];

describe("the status machine", () => {
  it("the happy path: sent → seen → ready → arrived, and every skip forward", () => {
    expect(canTransition("sent", "seen")).toBe(true);
    expect(canTransition("seen", "ready")).toBe(true);
    expect(canTransition("ready", "arrived")).toBe(true);
    // A patient who walks in before anyone acknowledged still arrives.
    expect(canTransition("sent", "arrived")).toBe(true);
    expect(canTransition("seen", "arrived")).toBe(true);
    expect(canTransition("sent", "ready")).toBe(true);
  });

  it("every live state may close as cancelled / not_arriving / hoax / expired", () => {
    for (const from of LIVE) {
      for (const to of ["cancelled", "not_arriving", "hoax", "expired"] as const) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
      }
    }
  });

  it("never backwards, never to itself", () => {
    expect(canTransition("seen", "sent")).toBe(false);
    expect(canTransition("ready", "seen")).toBe(false);
    expect(canTransition("ready", "sent")).toBe(false);
    for (const s of PRE_ARRIVAL_STATUSES) expect(canTransition(s, s), s).toBe(false);
  });

  it("a closed row has no exits — an arrived pre-alert cannot become a hoax, a hoax cannot arrive", () => {
    for (const from of CLOSED) {
      expect(PRE_ARRIVAL_TRANSITIONS[from]).toEqual([]);
      for (const to of PRE_ARRIVAL_STATUSES) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(false);
      }
    }
  });

  it("the table is total: every status is a key, every target is a status, all statuses in the CHECK", () => {
    expect(Object.keys(PRE_ARRIVAL_TRANSITIONS).sort()).toEqual([...PRE_ARRIVAL_STATUSES].sort());
    for (const targets of Object.values(PRE_ARRIVAL_TRANSITIONS)) {
      for (const t of targets) expect(PRE_ARRIVAL_STATUSES).toContain(t);
    }
    expect([...PRE_ARRIVAL_STATUSES].sort()).toEqual([...LIVE, ...CLOSED].sort());
  });

  it("the Deno and Drizzle copies are the same machine", () => {
    expect(PRE_ARRIVAL_TRANSITIONS).toEqual(DRIZZLE_TRANSITIONS);
    for (const from of PRE_ARRIVAL_STATUSES) {
      for (const to of PRE_ARRIVAL_STATUSES) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(drizzleCanTransition(from, to));
      }
    }
  });
});

describe("the Gate A numbers (ADR 0098 §Gate A decisions)", () => {
  it("3/h/device, 5/day/phone; hoax downgrade at 2; ack 5 min; board escalation 2 min", () => {
    expect(RATE_LIMITS).toEqual({ perDeviceHour: 3, perPhoneDay: 5 });
    expect(HOAX_DOWNGRADE_THRESHOLD).toBe(2);
    expect(ACK_TIMEOUT_MS).toBe(5 * 60_000);
    expect(BOARD_ESCALATION_MS).toBe(2 * 60_000);
  });

  it("the vocabularies match migration 0066's CHECKs", () => {
    expect(TRANSPORT_MODES).toEqual(["boda", "car", "taxi", "ambulance", "walking"]);
    expect(ETA_BANDS).toEqual(["under_15", "15_30", "30_60", "over_60"]);
  });
});

describe("composeFacilitySms — the offline fallback body (PRD §8.6)", () => {
  const base = {
    tier: "E" as const,
    dangerSign: "Chest pain spreading to arm or jaw",
    etaBand: "15_30" as EtaBand,
    transport: "boda" as TransportMode,
    callback: "+256772123456",
  };

  it("reads as tier, danger sign, ETA band, transport, callback — and nothing else", () => {
    expect(composeFacilitySms(base)).toBe(
      "MedSync pre-alert: EMERGENCY. Chest pain spreading to arm or jaw. Arriving 15-30 min by boda. Call back +256772123456",
    );
    expect(composeFacilitySms({ ...base, tier: "U", dangerSign: null })).toBe(
      "MedSync pre-alert: URGENT. Not sure. Arriving 15-30 min by boda. Call back +256772123456",
    );
  });

  it("is one GSM-7 segment for every band × transport × tier, and trims only the danger sign", () => {
    const longSign = "Very ".repeat(60) + "long danger sign";
    for (const tier of ["E", "U", "R"] as const) {
      for (const etaBand of ETA_BANDS) {
        for (const transport of TRANSPORT_MODES) {
          const sms = composeFacilitySms({
            ...base,
            tier,
            etaBand,
            transport,
            dangerSign: longSign,
          });
          expect(sms.length, `${tier}/${etaBand}/${transport}`).toBeLessThanOrEqual(SMS_MAX);
          // The structured fields always survive; only the sign is cut.
          expect(sms).toMatch(/^MedSync pre-alert: (EMERGENCY|URGENT|ROUTINE)\. /);
          expect(sms).toContain(`by ${transport}. Call back +256772123456`);
          expect(sms).toMatch(/^[\x20-\x7e]+$/);
        }
      }
    }
  });

  it("has no free-text or name argument, and strips what GSM-7 cannot carry", () => {
    // The type is the guarantee: the only string that is not an enum is the
    // danger sign (a catalog label) and the callback number.
    const sms = composeFacilitySms({
      ...base,
      dangerSign: "Fits — “shaking” that won’t stop",
      callback: "0772 123 456",
    });
    expect(sms).toContain('Fits - "shaking" that won\'t stop.');
    expect(sms).toMatch(/^[\x20-\x7e]+$/);
    expect(sms).not.toContain("—");
  });
});
