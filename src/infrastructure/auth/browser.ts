import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase Auth para componentes cliente (login). */
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
