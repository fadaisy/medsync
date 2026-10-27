"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CATALOGUE as C } from "@/content/pharmacy-catalogue";
import { CataloguePicker } from "../../_components/catalogue-picker";

/** Set-up › Catalogue's search: the picker (4.2); a pick opens that medicine's page (4.5). */
export function CatalogueOpen() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="self-start" onClick={() => setOpen(true)}>
        {C.open}
      </Button>
      <CataloguePicker
        open={open}
        onOpenChange={setOpen}
        pickLabel={C.openMedicine}
        onPick={(p) => {
          if (p.kind === "pack")
            router.push(`/pharmacy/setup?view=catalogue&medicine=${p.medicine.id}`);
        }}
      />
    </>
  );
}
