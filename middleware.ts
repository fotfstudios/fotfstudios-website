import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { type AdminClaims, isAdminMember } from "@/src/domain/auth/permissions";

/** Refresca la sesión y protege /admin/* (excepto /admin/login). */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  // RBAC: el rol viaja en el JWT (Custom Access Token Hook). getClaims valida la
  // firma y devuelve los claims; sin `app_role` no es un miembro admin activo.
  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims as AdminClaims | undefined) ?? null;

  const path = request.nextUrl.pathname;
  // Ya autenticado como admin: la página de login no aplica → al panel.
  if (path === "/admin/login" && isAdminMember(claims)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }
  if (path.startsWith("/admin") && path !== "/admin/login" && !isAdminMember(claims)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = { matcher: ["/admin/:path*"] };
