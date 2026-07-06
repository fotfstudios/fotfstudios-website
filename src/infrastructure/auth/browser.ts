import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase Auth para componentes cliente (login). */
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // `secure` en prod: la cookie de sesión solo viaja por HTTPS. HttpOnly no aplica (el
    // cliente browser la lee vía document.cookie); sameSite=lax es el default de @supabase/ssr.
    { cookieOptions: { secure: process.env.NODE_ENV === "production" } },
  );
}
