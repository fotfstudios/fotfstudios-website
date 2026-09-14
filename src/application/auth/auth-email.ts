import type { EmailMessage } from "@/src/application/ports/mailer";
import { authEmailChange, authLoginCode, authRecovery, authVerificationCode } from "@/src/application/notifications/templates";

/**
 * Payload del Send Email Hook de Supabase Auth (Standard Webhooks). Solo lo que usamos;
 * el resto del `user` viaja pero no se lee.
 * https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 */
export interface SendEmailHookPayload {
  user: { id: string; email: string; new_email?: string | null };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
}

/** Link "¿Prefieres un clic?": el mismo que arma GoTrue para {{ .ConfirmationURL }}. */
function verifyUrl(supabaseUrl: string, tokenHash: string, type: string, redirectTo: string): string {
  const q = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo });
  return `${supabaseUrl}/auth/v1/verify?${q.toString()}`;
}

/**
 * Del payload del hook a los correos que hay que mandar (0, 1 o 2). Puro: las
 * plantillas viven en templates.ts como todas las demás, versionadas y testeadas —
 * el Dashboard de Supabase deja de tener copy que espejar a mano (#151).
 *
 * `email_change` con confirmación doble trae DOS pares y los nombres están cruzados
 * por compatibilidad (doc de Supabase): al email ACTUAL va `token` + `token_hash_new`;
 * al email NUEVO va `token_new` + `token_hash`.
 */
export function authEmailsFor(p: SendEmailHookPayload, ctx: { supabaseUrl: string }): EmailMessage[] {
  const d = p.email_data;
  const type = d.email_action_type;
  const link = (hash: string) => verifyUrl(ctx.supabaseUrl, hash, type, d.redirect_to);

  switch (type) {
    case "magiclink":
    case "signup":
      return [{ to: p.user.email, ...authLoginCode({ token: d.token, confirmUrl: link(d.token_hash) }) }];
    case "recovery":
      return [{ to: p.user.email, ...authRecovery({ token: d.token, confirmUrl: link(d.token_hash) }) }];
    case "email_change": {
      const newEmail = p.user.new_email ?? p.user.email;
      const both = !!d.token_new && !!d.token_hash_new;
      if (both) {
        return [
          { to: p.user.email, ...authEmailChange({ token: d.token, confirmUrl: link(d.token_hash_new) }) },
          { to: newEmail, ...authEmailChange({ token: d.token_new, confirmUrl: link(d.token_hash) }) },
        ];
      }
      return [{ to: newEmail, ...authEmailChange({ token: d.token || d.token_new, confirmUrl: link(d.token_hash) }) }];
    }
    default:
      // Reautenticación u otros con código: verificación genérica. Las notificaciones
      // sin token (password_changed_notification, …) no aplican a una app passwordless.
      if (!d.token) return [];
      return [{ to: p.user.email, ...authVerificationCode({ token: d.token }) }];
  }
}
