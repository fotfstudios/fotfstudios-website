import Link from "next/link";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/** 404 propio: el del panel habla de "la reserva" y vuelve a /admin/reservas. */
export default function EquipoNotFound() {
  return (
    <EmptyState
      icon="doc"
      title="No encontramos ese equipo"
      hint="Puede que se haya eliminado o que el enlace esté mal escrito."
      action={
        <Link href="/admin/equipos" className={btn("secondary", "md")}>
          ← Volver a equipos
        </Link>
      }
    />
  );
}
