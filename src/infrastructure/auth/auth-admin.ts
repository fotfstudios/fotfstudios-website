import { createClient } from "@supabase/supabase-js";
import type { AdminInviter } from "@/src/application/ports/members";

/**
 * Invitación nativa de Supabase: `auth.admin.inviteUserByEmail` crea el usuario de
 * auth (aunque el signup público esté off) y manda el correo de invitación con un
 * enlace a `redirectTo`. Requiere service-role. Devuelve el `user_id` creado.
 */
export class SupabaseInviter implements AdminInviter {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
  ) {}

  async invite(email: string, redirectTo: string): Promise<string> {
    const supabase = createClient(this.url, this.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error || !data.user) throw new Error(error?.message ?? "invitación falló");
    return data.user.id;
  }
}
