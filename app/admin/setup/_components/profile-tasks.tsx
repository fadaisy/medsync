"use client";

import type { StepState } from "../_lib/rules";
import { useActionState, useState } from "react";

import {
  BED_CAPACITY_BANDS,
  CONNECTIVITY_CHOICES,
  EMR_CHOICES,
  POWER_CHOICES,
  STAFF_BANDS,
} from "@/app/signup/hospital/_lib/catalog";
import { CHECKLIST, OPD_BANDS_V2 } from "@/content/onboarding-setup";
import { formatUgPhone } from "@/lib/onboarding/fields";
import { cn } from "@/lib/utils";
import { saveContactsAction, saveOperatingAction } from "../checklist-actions";
import { fieldClass, FormStatus, SaveButton, SelectField, TextField } from "./ui";

/** The application columns the Recommended and Optional tasks edit (§5.10). */
export interface ProfileData {
  servicesOffered: string[];
  specialisedClinics: string[];
  diagnosticServices: string[];
  supportServices: string[];
  hasOnsitePharmacy: boolean | null;
  internetConnectivity: string | null;
  powerBackup: string | null;
  bedCapacityBand: string | null;
  clinicalStaffBand: string | null;
  dailyOpdBand: string | null;
  existingEmr: string | null;
  existingEmrName: string | null;
  mainPhone: string;
  officialEmail: string;
  website: string | null;
  hospitalAka: string | null;
  yearEstablished: number | null;
  physicalAddress: string;
}

const O = CHECKLIST.operating;
const C = CHECKLIST.contacts;

export function OperatingTask({ hospitalId, p }: { hospitalId: string; p: ProfileData }) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveOperatingAction, {});
  const [emr, setEmr] = useState(p.existingEmr ?? "");
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="hospital_id" value={hospitalId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          name="internet_connectivity"
          label={O.internet}
          choices={CONNECTIVITY_CHOICES}
          value={p.internetConnectivity}
        />
        <SelectField
          name="power_backup"
          label={O.power}
          choices={POWER_CHOICES}
          value={p.powerBackup}
        />
        <SelectField
          name="bed_capacity_band"
          label={O.beds}
          choices={BED_CAPACITY_BANDS}
          value={p.bedCapacityBand}
        />
        <SelectField
          name="clinical_staff_band"
          label={O.staff}
          choices={STAFF_BANDS}
          value={p.clinicalStaffBand}
        />
        <SelectField
          name="daily_opd_band"
          label={O.opd}
          choices={OPD_BANDS_V2}
          value={p.dailyOpdBand}
        />
        <SelectField
          name="existing_emr"
          label={O.emr}
          choices={EMR_CHOICES}
          value={emr}
          onChange={setEmr}
        />
        {emr === "existing" ? (
          <TextField
            name="existing_emr_name"
            label={O.emrName}
            defaultValue={p.existingEmrName ?? ""}
            maxLength={120}
            className="ease-expo-out transition-[opacity,translate] duration-150 motion-reduce:transition-none sm:col-start-2 starting:translate-y-1 starting:opacity-0"
          />
        ) : null}
      </div>
      <FormStatus state={state} />
      <SaveButton pending={pending} />
    </form>
  );
}

export function ContactsTask({ hospitalId, p }: { hospitalId: string; p: ProfileData }) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveContactsAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="hospital_id" value={hospitalId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="main_phone"
          label={C.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          defaultValue={p.mainPhone ? formatUgPhone(p.mainPhone) : ""}
          maxLength={40}
        />
        <TextField
          name="official_email"
          label={C.email}
          type="email"
          autoComplete="email"
          defaultValue={p.officialEmail}
          maxLength={254}
        />
        <TextField
          name="website"
          label={C.website}
          inputMode="url"
          autoComplete="url"
          defaultValue={p.website ?? ""}
          maxLength={200}
        />
        <TextField
          name="hospital_aka"
          label={C.aka}
          defaultValue={p.hospitalAka ?? ""}
          maxLength={120}
        />
        <TextField
          name="year_established"
          label={C.year}
          inputMode="numeric"
          pattern="[0-9]{4}"
          defaultValue={p.yearEstablished ?? ""}
          maxLength={4}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="setup-physical_address" className="text-body-s text-foreground font-medium">
          {C.landmark}
        </label>
        <textarea
          id="setup-physical_address"
          name="physical_address"
          defaultValue={p.physicalAddress}
          maxLength={300}
          rows={3}
          aria-describedby="setup-physical_address-hint"
          className={cn(fieldClass, "h-auto py-2.5")}
        />
        <p id="setup-physical_address-hint" className="text-body-s text-muted-foreground">
          {C.landmarkHint}
        </p>
      </div>
      <FormStatus state={state} />
      <SaveButton pending={pending} />
    </form>
  );
}
