"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { fulfilRecordsRequestAction } from "./actions";

export function FulfilButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() => start(async () => void (await fulfilRecordsRequestAction({ id, note: "" })))}
    >
      Mark sent
    </Button>
  );
}
