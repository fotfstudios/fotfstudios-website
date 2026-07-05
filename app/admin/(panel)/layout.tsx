import type { ReactNode } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdmin } from "@/src/infrastructure/auth/require-admin";

/**
 * Layout del panel autenticado. Monta el shell (sidebar + badge de pendientes) una sola vez
 * y lo mantiene fijo mientras el contenido de cada ruta carga (ver los loading.tsx de este
 * grupo). `/admin/login` queda fuera de este route group, por eso no lleva shell.
 *
 * `requireAdmin()` es defensa en profundidad: el middleware ya bloquea /admin/* sin rol admin,
 * pero re-verificar aquí (como hace /cuenta) hace que la autorización de LECTURA no dependa solo
 * del matcher del middleware. Si este falla o una página se mueve fuera de `(panel)`, el guard
 * lanza → error boundary de este grupo (fail-closed, sin filtrar datos).
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
