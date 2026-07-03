import Link from "next/link";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/**
 * 404 dentro del shell — solo para `notFound()` lanzado por páginas del panel
 * (p. ej. reserva inexistente). Las URLs que no existen bajo /admin las
 * atiende el app/not-found.tsx raíz (así funciona Next por diseño).
 */
export default function PanelNotFound() {
  return (
    <EmptyState
      icon="block"
      title="No encontramos ese registro"
      hint="Puede que la reserva se haya eliminado o que el enlace esté mal escrito."
      action={
        <Link href="/admin/reservas" className={btn("secondary", "md")}>
          ← Volver a reservas
        </Link>
      }
    />
  );
}
