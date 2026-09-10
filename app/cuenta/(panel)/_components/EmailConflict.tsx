import Link from "next/link";
import SignOutButton from "@/components/admin/SignOutButton";
import WhatsAppCta from "@/components/WhatsAppCta";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

const TITLE = "No pudimos abrir tu cuenta";

/**
 * Tu correo ya está en OTRA ficha del directorio, así que no pudimos vincularlo
 * a esta sesión. Ojo con la copia: `customer_email_owned_by_other_user` también
 * salta cuando la ficha dueña del email es un invitado sin cuenta o en la
 * carrera por PK — prometer "otra cuenta" sería falso. Fusionar es manual.
 *
 * Esta pantalla reemplaza el shell (no lo envuelve), así que no hereda el
 * "Salir" del header — sin el propio, alguien logueado con el correo
 * equivocado quedaría sin salida (`middleware.ts` rebota /cuenta/login → /cuenta
 * mientras haya sesión). `SignOutButton` limpia la cookie en el browser ANTES
 * de navegar, así que al llegar a /cuenta/login ya no hay sesión que rebote.
 */
export default function EmailConflict() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-20">
      {/* EmptyState pinta el título como <p> (por diseño, lo reusan pantallas
          con jerarquía propia) — esta es una página standalone sin ningún otro
          heading, así que le damos un <h1> real para lectores de pantalla sin
          tocar el look. */}
      <h1 className="sr-only">{TITLE}</h1>
      <EmptyState
        icon="user"
        title={TITLE}
        hint="Tu correo ya está registrado en otro cliente nuestro, así que no pudimos vincularlo a esta sesión. Escríbenos y lo unificamos."
        action={
          <WhatsAppCta
            source="cuenta-email-conflict"
            waMessage="Hola, no puedo entrar a mi cuenta: dice que mi correo ya está registrado."
            className={btn("primary", "md")}
          >
            Escríbenos por WhatsApp
          </WhatsAppCta>
        }
      />
      <div className="mt-8 flex items-center justify-center gap-4">
        <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← Volver al inicio
        </Link>
        <span className="text-bone-mute" aria-hidden="true">
          ·
        </span>
        {/* Escape real del loop: cierra la sesión ANTES de ir a /cuenta/login
            para entrar con otro correo (ver nota de arriba). */}
        <SignOutButton
          redirectTo="/cuenta/login"
          label="Entrar con otro correo"
          className="label-sm flex items-center gap-1.5 text-bone-mute transition-colors hover:text-gold"
        />
      </div>
    </main>
  );
}
