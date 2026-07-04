import Link from "next/link";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const dynamic = "force-dynamic";

/** Stub del resumen: valida el loop de auth end-to-end. Puntos y reservas llegan con el backend. */
export default async function CuentaResumen() {
  const session = await requireCustomer();

  return (
    <main>
      <p className="label text-bone-mute">Mi cuenta</p>
      <h1 className="font-display mt-2 text-bone" style={{ fontSize: "clamp(2rem,6vw,3rem)" }}>
        Hola
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-bone-dim">
        Sesión iniciada como <strong className="text-bone">{session.email}</strong>. Muy pronto verás aquí tus puntos y
        tus reservas.
      </p>
      <p className="label-sm mt-8">
        <Link href="/" className="text-bone-mute transition-colors hover:text-gold">
          ← Volver al sitio
        </Link>
      </p>
    </main>
  );
}
