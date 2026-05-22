import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AuthCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
  ...props
}: AuthCardProps) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground border-border shadow-card flex flex-col gap-6 rounded-lg border p-8",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-heading-l text-foreground">{title}</h1>
        {subtitle ? <p className="text-body-s text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
      {footer ? (
        <div className="border-gray-150 -mx-8 mt-2 -mb-8 border-t px-8 py-4">{footer}</div>
      ) : null}
    </div>
  );
}

interface FieldErrorProps {
  message?: string;
}

export function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return <p className="text-status-critical-fg text-[11px]">{message}</p>;
}

interface FormErrorProps {
  message?: string;
}

export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="bg-alert-bg border-alert-border text-alert-fg rounded-sm border px-3 py-2 text-[13px]"
    >
      {message}
    </div>
  );
}
