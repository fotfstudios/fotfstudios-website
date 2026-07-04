import { NextResponse } from "next/server";
import { failureLoginPath, resolveDestination } from "@/src/domain/auth/callback-redirect";
import { type AdminClaims, isAdminMember } from "@/src/domain/auth/permissions";
import { createAuthServerClient } from "@/src/infrastructure/auth/server";

export const dynamic = "force-dynamic";

/**
 * Intercambia el código del magic link por una sesión y enruta por rol:
 * `?next=` (allow-list anti open-redirect) decide el destino; un no-admin
 * pidiendo /admin cae a /cuenta en vez de rebotar en el login del panel.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const fail = NextResponse.redirect(new URL(`${failureLoginPath(next)}?error=auth`, url.origin));

  if (!code) return fail;

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Código inválido/expirado o sin sesión: avisamos en el login de origen en
    // vez de rebotar en silencio (la middleware lo devolvería igual al login).
    console.warn("[auth-callback]", error.message);
    return fail;
  }

  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims as AdminClaims | undefined) ?? null;
  return NextResponse.redirect(new URL(resolveDestination(next, isAdminMember(claims)), url.origin));
}
