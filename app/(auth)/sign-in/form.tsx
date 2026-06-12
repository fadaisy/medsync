"use client";

import type { SignInState } from "./actions";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { AuthCard, FieldError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthNotice, ButtonSpinner } from "../_components/auth-notice";
import { signInAction } from "./actions";

const initial: SignInState = {};

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initial);
  const params = useSearchParams();
  const justSignedUp = params.get("signed-up") === "1";
  const redirectTo = params.get("redirect") ?? "";

  return (
    <AuthCard
      title="Sign in"
      subtitle={
        justSignedUp ? (
          <span className="scale-in inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-300">
            <CheckIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            Account created. Sign in to continue.
          </span>
        ) : (
          "Welcome back. Sign in to continue."
        )
      }
      footer={
        <p className="text-body-s text-muted-foreground">
          New here?{" "}
          <Link
            href="/get-started"
            className="text-primary underline decoration-transparent underline-offset-2 transition-[text-decoration-color] duration-200 hover:decoration-current"
          >
            Get started
          </Link>
        </p>
      }
    >
      <form action={formAction} className="stagger-children flex flex-col gap-4">
        <AuthNotice message={state.errors?._form} />
        <input type="hidden" name="redirect" value={redirectTo} />

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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!!state.errors?.password}
          />
          <FieldError message={state.errors?.password} />
        </div>

        <Button type="submit" disabled={pending} variant="primary" size="md" className="tap">
          {pending ? (
            <>
              <ButtonSpinner />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
