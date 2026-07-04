"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { validateProfile } from "@/lib/profile";
import { customerService } from "@/src/composition";
import { assertCustomer } from "@/src/infrastructure/auth/require-customer";

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const session = await assertCustomer();
    const data = validateProfile({
      name: String(fd.get("name") ?? ""),
      phone: String(fd.get("phone") ?? ""),
    });
    await customerService().updateProfile(session.userId, data);
    revalidatePath("/cuenta", "layout");
  });
}
