import type { ReactNode } from "react";
import AdminShell from "@/components/admin/AdminShell";

/**
 * Layout del panel autenticado. Monta el shell (sidebar + badge de pendientes) una sola vez
 * y lo mantiene fijo mientras el contenido de cada ruta carga (ver los loading.tsx de este
 * grupo). `/admin/login` queda fuera de este route group, por eso no lleva shell.
 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
