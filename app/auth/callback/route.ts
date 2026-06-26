import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/src/infrastructure/auth/server";

export const dynamic = "force-dynamic";

/** Intercambia el código del magic link por una sesión y entra al admin. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createAuthServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/admin", url.origin));
}
