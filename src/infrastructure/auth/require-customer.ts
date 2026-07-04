import { redirect } from "next/navigation";
import { createAuthServerClient } from "./server";

export interface CustomerSession {
  userId: string;
  email: string;
}

/** Sesión actual (cualquier usuario autenticado con email verificado) o null. */
export async function currentCustomer(): Promise<CustomerSession | null> {
  const supabase = await createAuthServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub || !claims.email) return null;
  return { userId: claims.sub, email: claims.email.toLowerCase() };
}

/** Páginas/layouts de /cuenta: sin sesión → al login (defensa además del middleware). */
export async function requireCustomer(): Promise<CustomerSession> {
  const session = await currentCustomer();
  if (!session) redirect("/cuenta/login");
  return session;
}

/**
 * Server actions: lanza en vez de redirigir — `run()` captura todo (incluido
 * NEXT_REDIRECT), así que un redirect aquí se perdería como {ok:false}.
 */
export async function assertCustomer(): Promise<CustomerSession> {
  const session = await currentCustomer();
  if (!session) throw new Error("no autorizado");
  return session;
}
