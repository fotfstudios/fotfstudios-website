import Link from "next/link";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/**
 * 404 propio de la sección: el del panel (`app/admin/(panel)/not-found.tsx`)
 * habla de "la reserva" y vuelve a /admin/reservas, que acá leería mal.
 */
export default function ClienteNotFound() {
  return (
    <EmptyState
      icon="user"
      title="No encontramos ese cliente"
      hint="Puede que la ficha se haya fusionado o que el enlace esté mal escrito."
      action={
        <Link href="/admin/clientes" className={btn("secondary", "md")}>
          ← Volver a clientes
        </Link>
      }
    />
  );
}
