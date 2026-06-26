import { isAdminEmail } from "./admins";
import { createAuthServerClient } from "./server";

/** Re-verifica admin en cada server action (las actions son endpoints POST). */
export async function requireAdmin(): Promise<void> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error("no autorizado");
}
