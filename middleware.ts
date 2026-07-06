import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { type AdminClaims, isAdminMember } from "@/src/domain/auth/permissions";
import { accountEnabled } from "@/lib/flags";

/**
 * Refresca la sesión y protege las áreas privadas: /admin/* exige rol admin
 * (claims RBAC en el JWT), /cuenta/* exige cualquier sesión válida. /reservar
 * solo pasa por aquí para refrescar cookies (los Server Components no pueden
 * escribirlas), sin guard.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `secure` en prod: la cookie de sesión solo viaja por HTTPS (defensa en profundidad
      // sobre el HSTS del dominio). HttpOnly queda false por diseño de @supabase/ssr.
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims valida la firma del JWT. Rol admin viaja como claim (Custom Access
  // Token Hook); cualquier sesión válida (`sub`) es la credencial de cliente.
  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims as (AdminClaims & { sub?: string }) | undefined) ?? null;
  const isAdmin = isAdminMember(claims);
  const isAuthed = Boolean(claims?.sub);

  const path = request.nextUrl.pathname;
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    return NextResponse.redirect(url);
  };

  // — /admin: exige rol admin —
  if (path === "/admin/login" && isAdmin) return redirectTo("/admin");
  if (path.startsWith("/admin") && path !== "/admin/login" && !isAdmin) return redirectTo("/admin/login");

  // — /cuenta: exige sesión (solo con el flag encendido; apagado → notFound en páginas) —
  if (accountEnabled()) {
    if (path === "/cuenta/login" && isAuthed) return redirectTo("/cuenta");
    if (path.startsWith("/cuenta") && path !== "/cuenta/login" && !isAuthed) return redirectTo("/cuenta/login");
  }

  return response;
}

export const config = { matcher: ["/admin/:path*", "/cuenta/:path*", "/reservar"] };
