import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, LockIcon } from "lucide-react";

import { fetchPatientProfileView, ID_TYPE_LABEL, SEX_LABEL } from "@/lib/patient/profile";
import { requirePatientScope } from "@/lib/patient/scope";
import { ProfileForm } from "./_components/profile-form";

export const metadata: Metadata = { title: "Profile · MedSync" };
export const dynamic = "force-dynamic";

export default async function PatientProfilePage() {
  const scope = await requirePatientScope();
  const profile = await fetchPatientProfileView(scope.userId);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <Link
        href="/patient/menu"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        Back to More
      </Link>

      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          MedSync · Profile
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Your profile
        </h1>
        <p className="text-muted-foreground max-w-[44ch] text-[13px] leading-relaxed">
          Identity details stay locked — change them through support. Contact, language, and
          conditions are yours to edit any time.
        </p>
      </header>

      {/* ── Identity (read-only) ──────────────────────────────── */}
      {profile ? (
        <section className="border-border bg-muted/20 flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
              Identity
            </h2>
            <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] uppercase">
              <LockIcon className="size-3" aria-hidden />
              Locked
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadField label="Patient code" value={profile.patientCode} mono />
            <ReadField label="First name" value={profile.firstName} />
            <ReadField label="Surname" value={profile.surname} />
            <ReadField label="Sex" value={SEX_LABEL[profile.sex] ?? profile.sex} />
            <ReadField label="Date of birth" value={profile.dateOfBirth} mono />
            <ReadField
              label="ID"
              value={
                profile.idType === "none"
                  ? "Not on file"
                  : `${ID_TYPE_LABEL[profile.idType] ?? profile.idType}${
                      profile.idNumberLast4 ? ` · ⋯${profile.idNumberLast4}` : ""
                    }`
              }
            />
          </div>
          <p className="text-muted-foreground mt-1 text-[11.5px] leading-relaxed">
            Need to change any of these? They affect identity verification, so they go through
            support — a request flow lands here soon.
          </p>
        </section>
      ) : (
        <section className="border-destructive/30 bg-destructive/5 rounded-xl border p-4">
          <p className="text-destructive text-[12.5px] leading-relaxed">
            We couldn&rsquo;t load your profile right now. Try again in a moment, or sign out and
            back in.
          </p>
        </section>
      )}

      {/* ── Editable fields ──────────────────────────────────── */}
      {profile ? (
        <ProfileForm
          defaults={{
            phone: profile.phone,
            villageAddress: profile.villageAddress,
            preferredLanguage: profile.preferredLanguage,
            knownConditions: profile.knownConditions,
            nokName: profile.nokName,
            nokRelationship: profile.nokRelationship,
            nokPhone: profile.nokPhone,
          }}
        />
      ) : null}
    </div>
  );
}

function ReadField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[10.5px] tracking-tight uppercase">{label}</span>
      <span
        className={
          mono
            ? "text-foreground font-mono text-[13px] tabular-nums"
            : "text-foreground text-[13.5px]"
        }
      >
        {value}
      </span>
    </div>
  );
}
