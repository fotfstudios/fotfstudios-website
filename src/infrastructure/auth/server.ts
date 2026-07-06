import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente Supabase Auth para Server Components / route handlers (sesión por cookie). */
export async function createAuthServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `secure` en prod: la cookie de sesión solo viaja por HTTPS (defensa en profundidad
      // sobre el HSTS del dominio). HttpOnly queda false por diseño de @supabase/ssr.
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items) {
          try {
            items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component: las cookies las refresca el middleware.
          }
        },
      },
    },
  );
}
