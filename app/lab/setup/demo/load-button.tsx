"use client";

import { Button } from "@/components/ui/button";
import { Said, useAct } from "../criticals/_components/setup-forms";
import { loadDemoDayAction } from "./actions";

export function LoadDemoDay() {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="w-fit"
        disabled={pending}
        onClick={() => act(loadDemoDayAction, "Loaded. Every lab page now has demo data.")}
      >
        {pending ? "Loading the demo lab… (up to a minute)" : "Load a demo lab"}
      </Button>
      <Said message={message} />
    </div>
  );
}
