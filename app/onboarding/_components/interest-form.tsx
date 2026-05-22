"use client";

import type { InterestState } from "../_actions";
import { useActionState } from "react";

import { AuthCard, FieldError, FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitInterestAction } from "../_actions";

type Audience = "patient" | "clinical" | "hospital";

interface InterestFormProps {
  audience: Audience;
  title: string;
  subtitle: string;
  /** Optional source identifier (e.g. "hero-cta") to track which entry led here. */
  source?: string;
}

const initial: InterestState = {};

export function InterestForm({ audience, title, subtitle, source }: InterestFormProps) {
  const [state, formAction, pending] = useActionState(
    submitInterestAction.bind(null, audience),
    initial,
  );

  if (state.ok) {
    return (
      <AuthCard
        title="Thanks — we'll be in touch."
        subtitle="Your interest is logged. We email you when MedSync opens to your audience."
      >
        <div className="text-body-s text-muted-foreground">
          <p>
            If you have something to add in the meantime, write to{" "}
            <a className="text-primary hover:underline" href="mailto:hello@medsync.health">
              hello@medsync.health
            </a>
            .
          </p>
        </div>
      </AuthCard>
    );
  }

  const isHospital = audience === "hospital";
  const isClinical = audience === "clinical";

  return (
    <AuthCard title={title} subtitle={subtitle}>
      <form action={formAction} className="flex flex-col gap-4">
        <FormError message={state.errors?._form} />
        {source ? <input type="hidden" name="source" value={source} /> : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="full_name">Your name</Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            required
            aria-invalid={!!state.errors?.full_name}
          />
          <FieldError message={state.errors?.full_name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={!!state.errors?.email}
          />
          <FieldError message={state.errors?.email} />
        </div>

        {isHospital ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hospital_name">Hospital / facility</Label>
            <Input
              id="hospital_name"
              name="hospital_name"
              type="text"
              autoComplete="organization"
              aria-invalid={!!state.errors?.hospital_name}
            />
            <FieldError message={state.errors?.hospital_name} />
          </div>
        ) : null}

        {isHospital || isClinical ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">Role / title</Label>
            <Input
              id="role"
              name="role"
              type="text"
              autoComplete="organization-title"
              aria-invalid={!!state.errors?.role}
            />
            <FieldError message={state.errors?.role} />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="context">
            Anything you want us to know? <span className="text-muted-foreground">(optional)</span>
          </Label>
          <textarea
            id="context"
            name="context"
            rows={3}
            maxLength={800}
            className="border-input bg-card text-foreground ease-expo-out rounded-sm border px-2.5 py-2 text-[13px] transition-all duration-150 outline-none focus-visible:border-teal-500 focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)] dark:focus-visible:border-teal-400 dark:focus-visible:shadow-[0_0_0_2px_rgba(45,212,191,0.2)]"
            aria-invalid={!!state.errors?.context}
          />
          <FieldError message={state.errors?.context} />
        </div>

        <Button type="submit" disabled={pending} variant="primary" size="md">
          {pending ? "Submitting…" : "Express interest"}
        </Button>

        <p className="text-muted-foreground text-[11px]">
          By submitting, you agree we may contact you about MedSync. We never share your details.
          Full privacy policy pending (lawyer review).
        </p>
      </form>
    </AuthCard>
  );
}
