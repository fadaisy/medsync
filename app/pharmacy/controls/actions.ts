"use server";

import { z } from "zod";

import { caseMedicines } from "@/lib/pharmacy/cases/read";
import * as cases from "@/lib/pharmacy/cases/store";
import { ANY, controlsAct, controlsRead } from "@/lib/pharmacy/cd/act";
import { cdPrescribers, rosterAt, wardPatients } from "@/lib/pharmacy/cd/read";
import * as cd from "@/lib/pharmacy/cd/store";
import { handoverDraft } from "@/lib/pharmacy/handover/read";
import * as ho from "@/lib/pharmacy/handover/store";

/**
 * Controls (rework PRD §6.5): controlled-drug checks and their fixes, shift handover, investigations. Every write
 * goes through `controlsAct` (the pharmacy write path); who may do what is decided in the database (0267).
 */
const MANAGE = "pharmacy.manage" as const;

export const cdCheckAction = async (raw: unknown) =>
  controlsAct("cdCheck", cd.CheckInput, raw, ANY, cd.cdBalanceCheck);
export const resolveCdAction = async (raw: unknown) =>
  controlsAct("resolveCd", cd.ResolveInput, raw, ANY, cd.resolveCdCheck);
export const cdEventAction = async (raw: unknown) =>
  controlsAct("cdEvent", cd.EventInput, raw, ANY, cd.addCdEvent);

export const handOverAction = async (raw: unknown) =>
  controlsAct("handOver", ho.HandoverInput, raw, ANY, ho.handOverStation);
export const acceptHandoverAction = async (raw: unknown) =>
  controlsAct("acceptHandover", ho.AcceptInput, raw, ANY, ho.acceptHandover);
export const explainMissedAction = async (raw: unknown) =>
  controlsAct("explainMissed", ho.MissInput, raw, ANY, ho.explainMissed);
export const resolveDiffAction = async (raw: unknown) =>
  controlsAct("resolveDiff", ho.DiffInput, raw, ANY, ho.resolveHandoverDiff);

export const openCaseAction = async (raw: unknown) =>
  controlsAct("openCase", cases.NewCaseInput, raw, ANY, cases.openManualCase);
export const assignCaseAction = async (raw: unknown) =>
  controlsAct("assignCase", cases.AssignInput, raw, MANAGE, cases.assignCase);
export const takeCaseAction = async (raw: unknown) =>
  controlsAct("takeCase", cases.CaseIdInput, raw, ANY, cases.takeCase);
export const caseStepAction = async (raw: unknown) =>
  controlsAct("caseStep", cases.StepInput, raw, ANY, cases.addCaseStep);
export const findingsAction = async (raw: unknown) =>
  controlsAct("findings", cases.FindingsInput, raw, ANY, cases.submitFindings);
export const signOffAction = async (raw: unknown) =>
  controlsAct("signOff", cases.CaseIdInput, raw, ANY, cases.signOffCase);
export const sendBackAction = async (raw: unknown) =>
  controlsAct("sendBack", cases.BackInput, raw, ANY, cases.sendBack);
export const escalateAction = async (raw: unknown) =>
  controlsAct("escalate", cases.EscalateInput, raw, ANY, cases.escalateCase);

/** The handover dialog's draft: what to count, who is on duty at the slot, the seal and the open items. */
export async function handoverDraftAction(raw: unknown) {
  const i = z.object({ locationId: z.uuid(), at: z.coerce.date() }).parse(raw);
  return controlsRead((db, a) => handoverDraft(db, a.hospitalId, i.locationId, i.at));
}

/** A late entry's choices: the patients on the ward, the prescribers allowed, the people on the roster then. */
export async function doseContextAction(raw: unknown) {
  const i = z
    .object({ locationId: z.uuid(), medicineId: z.string().min(1).max(120), at: z.coerce.date() })
    .parse(raw);
  return controlsRead(async (db, a) => {
    const [patients, prescribers, people] = await Promise.all([
      wardPatients(db, a.hospitalId, i.locationId),
      cdPrescribers(db, a.hospitalId, i.medicineId, i.locationId),
      rosterAt(db, a.hospitalId, i.locationId, i.at),
    ]);
    return { patients, prescribers, people };
  });
}

/** "Report a discrepancy": what is held where. */
export async function caseMedicinesAction() {
  return controlsRead((db, a) => caseMedicines(db, a.hospitalId));
}
