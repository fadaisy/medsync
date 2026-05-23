"use client";

import type { PickedFile } from "@/components/form/file-upload";
import type { DateRange } from "react-day-picker";
import * as React from "react";
import { BriefcaseIcon, HeartPulseIcon, HospitalIcon, ShieldCheckIcon } from "lucide-react";

import { CascadingCombobox } from "@/components/form/cascading-combobox";
import { Combobox } from "@/components/form/combobox";
import { DatePicker } from "@/components/form/date-picker";
import { FileUpload } from "@/components/form/file-upload";
import { OtpInput } from "@/components/form/otp-input";
import { RadioCards } from "@/components/form/radio-cards";
import { SegmentedControl } from "@/components/form/segmented";
import { Label } from "@/components/ui/label";

const DISTRICTS = [
  { value: "kampala", label: "Kampala", description: "Central · ~1.65M residents" },
  { value: "wakiso", label: "Wakiso", description: "Central · ~2.92M residents" },
  { value: "mukono", label: "Mukono", description: "Central · ~700K residents" },
  { value: "jinja", label: "Jinja", description: "Eastern · ~470K residents" },
  { value: "gulu", label: "Gulu", description: "Northern · ~330K residents" },
  { value: "mbarara", label: "Mbarara", description: "Western · ~470K residents" },
  { value: "lira", label: "Lira", description: "Northern · ~410K residents" },
  { value: "arua", label: "Arua", description: "West Nile · ~830K residents" },
  { value: "kasese", label: "Kasese", description: "Western · ~810K residents" },
  { value: "soroti", label: "Soroti", description: "Eastern · ~300K residents" },
];

const SUBCOUNTIES: ReadonlyArray<{
  value: string;
  label: string;
  parentValue: string;
}> = [
  { value: "kampala-central", label: "Kampala Central Division", parentValue: "kampala" },
  { value: "kawempe", label: "Kawempe Division", parentValue: "kampala" },
  { value: "makindye", label: "Makindye Division", parentValue: "kampala" },
  { value: "nakawa", label: "Nakawa Division", parentValue: "kampala" },
  { value: "rubaga", label: "Rubaga Division", parentValue: "kampala" },
  { value: "kira-mc", label: "Kira Municipality", parentValue: "wakiso" },
  { value: "makindye-ssabagabo", label: "Makindye Ssabagabo", parentValue: "wakiso" },
  { value: "nansana-mc", label: "Nansana Municipality", parentValue: "wakiso" },
  { value: "mukono-central", label: "Mukono Central", parentValue: "mukono" },
  { value: "goma", label: "Goma", parentValue: "mukono" },
];

const SEX_OPTIONS = [
  { value: "f", label: "Female" },
  { value: "m", label: "Male" },
  { value: "x", label: "Other" },
] as const;

const ID_OPTIONS = [
  { value: "nin", label: "NIN" },
  { value: "passport", label: "Passport" },
  { value: "refugee", label: "Refugee ID" },
  { value: "none", label: "None" },
] as const;

const INTENT_OPTIONS = [
  {
    value: "patient",
    label: "I'm a patient",
    description: "Track conditions, medications, and care visits — at home or at a hospital.",
    helper: "MS- ID auto-issued",
    icon: <HeartPulseIcon className="size-3.5" strokeWidth={1.75} />,
  },
  {
    value: "clinician",
    label: "I work in a hospital",
    description:
      "Doctor, nurse, midwife, pharmacist, technician, or admin. Council credentials required.",
    helper: "Approval gated",
    icon: <BriefcaseIcon className="size-3.5" strokeWidth={1.75} />,
  },
  {
    value: "hospital",
    label: "I represent a hospital",
    description: "Express interest or apply on behalf of your facility. MoH license required.",
    helper: "Pilot wait-listed",
    icon: <HospitalIcon className="size-3.5" strokeWidth={1.75} />,
  },
] as const;

type IntentValue = (typeof INTENT_OPTIONS)[number]["value"];

function DemoRow({
  label,
  spec,
  children,
}: {
  label: string;
  spec: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-gray-150 grid grid-cols-1 items-start gap-6 border-b pb-8 last:border-b-0 last:pb-0 sm:grid-cols-[180px_1fr]">
      <div className="flex flex-col gap-1">
        <code className="text-foreground font-mono text-[11px]">{label}</code>
        <span className="text-muted-foreground text-[11px]">{spec}</span>
      </div>
      <div className="max-w-xl">{children}</div>
    </div>
  );
}

export function FormPrimitivesDemo() {
  // Combobox
  const [district, setDistrict] = React.useState<string | null>(null);
  const [subcounty, setSubcounty] = React.useState<string | null>(null);

  // Segmented
  const [sex, setSex] = React.useState<(typeof SEX_OPTIONS)[number]["value"] | null>("f");
  const [idType, setIdType] = React.useState<(typeof ID_OPTIONS)[number]["value"] | null>("nin");

  // RadioCards
  const [intent, setIntent] = React.useState<IntentValue | null>("patient");

  // FileUpload
  const [licenseFiles, setLicenseFiles] = React.useState<PickedFile[]>([]);
  const [galleryFiles, setGalleryFiles] = React.useState<PickedFile[]>([]);
  const [rejection, setRejection] = React.useState<string | null>(null);

  // OTP
  const [otp, setOtp] = React.useState("");
  const [otpFailed, setOtpFailed] = React.useState(false);

  // DatePicker
  const [dob, setDob] = React.useState<Date | null>(null);
  const [licenseExpiry, setLicenseExpiry] = React.useState<Date | null>(null);
  const [shiftWindow, setShiftWindow] = React.useState<DateRange | null>(null);
  const [callbackAt, setCallbackAt] = React.useState<Date | null>(null);

  return (
    <div className="flex flex-col gap-12">
      {/* Combobox */}
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-heading-s text-foreground">Combobox</h3>
          <code className="text-muted-foreground font-mono text-[11px]">
            components/form/combobox.tsx
          </code>
        </div>
        <DemoRow label="Combobox" spec="Searchable single-select. Default for any list >15 items.">
          <Label htmlFor="district">District</Label>
          <Combobox
            id="district"
            items={DISTRICTS}
            value={district}
            onValueChange={setDistrict}
            placeholder="Select district…"
            searchPlaceholder="Search 10 districts…"
          />
          <p className="text-muted-foreground mt-2 text-[11px]">
            Selected: <code className="font-mono">{district ?? "null"}</code>
          </p>
        </DemoRow>
        <DemoRow
          label="CascadingCombobox"
          spec="Child of a parent combobox. Disabled until parent has a value; clears when parent changes."
        >
          <Label htmlFor="subcounty">Subcounty / Division</Label>
          <CascadingCombobox
            id="subcounty"
            items={SUBCOUNTIES}
            parentValue={district}
            value={subcounty}
            onValueChange={setSubcounty}
            placeholder="Select subcounty…"
            placeholderEmptyParent="Pick a district first"
          />
          <p className="text-muted-foreground mt-2 text-[11px]">
            Selected: <code className="font-mono">{subcounty ?? "null"}</code>
          </p>
        </DemoRow>
      </div>

      {/* Segmented */}
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-heading-s text-foreground">Segmented</h3>
          <code className="text-muted-foreground font-mono text-[11px]">
            components/form/segmented.tsx
          </code>
        </div>
        <DemoRow label="2–4 options" spec="Atomic mutually-exclusive choices.">
          <Label>Sex</Label>
          <SegmentedControl
            options={SEX_OPTIONS}
            value={sex}
            onValueChange={setSex}
            aria-label="Sex"
          />
        </DemoRow>
        <DemoRow label="size = sm" spec="Tighter variant for inline placement.">
          <Label>ID type</Label>
          <SegmentedControl
            options={ID_OPTIONS}
            value={idType}
            onValueChange={setIdType}
            size="sm"
            aria-label="ID type"
          />
        </DemoRow>
        <DemoRow label="disabled" spec="">
          <SegmentedControl
            options={SEX_OPTIONS}
            value={sex}
            onValueChange={setSex}
            disabled
            aria-label="Sex (disabled)"
          />
        </DemoRow>
      </div>

      {/* RadioCards */}
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-heading-s text-foreground">RadioCards</h3>
          <code className="text-muted-foreground font-mono text-[11px]">
            components/form/radio-cards.tsx
          </code>
        </div>
        <DemoRow
          label="columns = 1"
          spec="Used on /get-started for the intent picker. Description + icon + helper line."
        >
          <Label>I&apos;m signing up as</Label>
          <RadioCards
            options={INTENT_OPTIONS}
            value={intent}
            onValueChange={setIntent}
            aria-label="Signup intent"
          />
        </DemoRow>
        <DemoRow label="columns = 2" spec="Grid layout on sm+, single column on mobile.">
          <RadioCards
            options={[
              {
                value: "moh",
                label: "MoH-registered",
                description: "Public facility on the MoH facility list.",
                icon: <ShieldCheckIcon className="size-3.5" strokeWidth={1.75} />,
              },
              {
                value: "private",
                label: "Private",
                description: "Privately-owned, licensed by MoH.",
                icon: <HospitalIcon className="size-3.5" strokeWidth={1.75} />,
              },
              {
                value: "ngo",
                label: "NGO / Faith-based",
                description: "Mission, NGO, or faith-led — e.g. UPMB, UCMB.",
                icon: <HeartPulseIcon className="size-3.5" strokeWidth={1.75} />,
              },
              {
                value: "clinic",
                label: "Private clinic",
                description: "Small private clinic. License optional at express-interest stage.",
                icon: <BriefcaseIcon className="size-3.5" strokeWidth={1.75} />,
              },
            ]}
            value={null}
            onValueChange={() => undefined}
            columns={2}
            aria-label="Hospital type"
          />
        </DemoRow>
      </div>

      {/* FileUpload */}
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-heading-s text-foreground">FileUpload</h3>
          <code className="text-muted-foreground font-mono text-[11px]">
            components/form/file-upload.tsx
          </code>
        </div>
        <DemoRow
          label="single, max 5 MB"
          spec="License certificate, ID photo. Replaces previous selection."
        >
          <Label>License certificate</Label>
          <FileUpload
            value={licenseFiles}
            onFilesChange={setLicenseFiles}
            onReject={(reason, file) => setRejection(`${file.name}: ${reason}`)}
            accept=".pdf,image/jpeg,image/png"
            maxSize={5 * 1024 * 1024}
            hint="PDF, JPG, or PNG · up to 5 MB"
            aria-label="License certificate"
          />
          {rejection ? <p className="mt-2 text-[11px] text-red-500">{rejection}</p> : null}
        </DemoRow>
        <DemoRow
          label="multiple, max 4"
          spec="Multi-file mode — used rarely (hospital ownership docs)."
        >
          <Label>Supporting documents</Label>
          <FileUpload
            value={galleryFiles}
            onFilesChange={setGalleryFiles}
            multiple
            maxFiles={4}
            maxSize={2 * 1024 * 1024}
            accept="image/*"
            hint="Images only · up to 4 files · 2 MB each"
            aria-label="Supporting documents"
          />
        </DemoRow>
      </div>

      {/* OTP */}
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-heading-s text-foreground">OtpInput</h3>
          <code className="text-muted-foreground font-mono text-[11px]">
            components/form/otp-input.tsx
          </code>
        </div>
        <DemoRow
          label="length = 6"
          spec="Phone/email verification. Numeric, paste-friendly, auto-advance."
        >
          <Label>Verification code</Label>
          <OtpInput
            value={otp}
            onValueChange={(v) => {
              setOtp(v);
              setOtpFailed(false);
            }}
            onComplete={(code) => {
              setOtpFailed(code !== "123456");
            }}
            aria-invalid={otpFailed}
            aria-label="6-digit verification code"
          />
          <p className="text-muted-foreground mt-2 text-[11px]">
            Try <code className="font-mono">123456</code> to clear the invalid state. Value:{" "}
            <code className="font-mono">{otp || "—"}</code>
            {otpFailed ? <span className="ml-2 text-red-500">Invalid code</span> : null}
          </p>
        </DemoRow>
      </div>

      {/* DatePicker */}
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-heading-s text-foreground">DatePicker</h3>
          <code className="text-muted-foreground font-mono text-[11px]">
            components/form/date-picker.tsx
          </code>
        </div>
        <DemoRow label='mode="single"' spec="Default. Dropdown captions for fast year jumps.">
          <Label htmlFor="dob">Date of birth</Label>
          <DatePicker
            id="dob"
            mode="single"
            value={dob}
            onValueChange={setDob}
            placeholder="Pick date of birth"
            fromDate={new Date(1900, 0, 1)}
            toDate={new Date()}
          />
        </DemoRow>
        <DemoRow
          label="single, no dropdown"
          spec="Plain caption for tight date windows (e.g. license expiry, next 5 years)."
        >
          <Label htmlFor="expiry">License expiry</Label>
          <DatePicker
            id="expiry"
            mode="single"
            value={licenseExpiry}
            onValueChange={setLicenseExpiry}
            withDropdownCaption={false}
            placeholder="Pick expiry date"
            fromDate={new Date()}
          />
        </DemoRow>
        <DemoRow label='mode="range"' spec="Two-month grid. Apply commits the range.">
          <Label htmlFor="shift">Shift window</Label>
          <DatePicker
            id="shift"
            mode="range"
            value={shiftWindow}
            onValueChange={setShiftWindow}
            placeholder="Pick a shift window"
          />
        </DemoRow>
        <DemoRow
          label='mode="datetime"'
          spec="15-min granularity by default. For callback windows, on-call shifts."
        >
          <Label htmlFor="callback">Preferred callback</Label>
          <DatePicker
            id="callback"
            mode="datetime"
            value={callbackAt}
            onValueChange={setCallbackAt}
            placeholder="Pick date and time"
            fromDate={new Date()}
          />
        </DemoRow>
      </div>
    </div>
  );
}
