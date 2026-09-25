import Link from "next/link";
import Logo from "@/components/Logo";
import Button from "../_ds/Button";

/**
 * Barra fija mínima: la landing tiene una sola acción (la solicitud), así que no
 * monta el Nav del sitio. El blur vive en el header, que es hermano — nunca un
 * wrapper — del cursor y del medidor (ver app/(marketing)/layout.tsx).
 */
export default function DsHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[rgba(10,10,10,0.8)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-2">
        <Link href="/" aria-label="FOTF Studios — volver al inicio" className="rounded-[var(--radius-sm)]">
          <Logo variant="mini" color="cream" height={48} />
        </Link>
        <Button size="sm" href="#reserva">
          Reservar prueba
        </Button>
      </div>
    </header>
  );
}
