import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/src/infrastructure/auth/server";

export const dynamic = "force-dynamic";

/** Intercambia el código del magic link por una sesión y entra al admin. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const fail = NextResponse.redirect(new URL("/admin/login?error=auth", url.origin));

  if (!code) return fail;

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Código inválido/expirado o sin sesión: avisamos en el login en vez de
    // rebotar en silencio al /admin (la middleware lo devolvería igual al login).
    console.warn("[auth-callback]", error.message);
    return fail;
  }

  return NextResponse.redirect(new URL("/admin", url.origin));
}
