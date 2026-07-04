import Link from "next/link";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/** 404 dentro del shell — para `notFound()` lanzado por páginas del área de clientes. */
export default function CuentaNotFound() {
  return (
    <EmptyState
      icon="block"
      title="No encontramos esa página"
      hint="Puede que el enlace esté mal escrito o que ya no exista."
      action={
        <Link href="/cuenta" className={btn("secondary", "md")}>
          ← Volver a mi cuenta
        </Link>
      }
    />
  );
}
