"use server";

import type { PhotoState } from "@/components/forms";
import { revalidatePath } from "next/cache";

import { storeAvatar } from "@/lib/avatars";
import { requireDoctorScope } from "@/lib/doctor/scope";

/** Replace the doctor's photo (ADR 0085 §1). Field name: `photo`. */
export async function updateDoctorPhotoAction(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const scope = await requireDoctorScope();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  const key = await storeAvatar(scope.userId, file);
  if (!key) return { error: "We couldn't save that photo — try a JPEG or PNG under 8 MB." };
  // The shell (layout) shows the photo too, so revalidate the whole workspace.
  revalidatePath("/doctor", "layout");
  return { ok: true };
}
