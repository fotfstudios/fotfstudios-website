import Link from "next/link";
import WhatsAppCta from "@/components/WhatsAppCta";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/**
 * Tu correo ya está en OTRA ficha del directorio, así que no pudimos vincularlo
 * a esta sesión. Ojo con la copia: `customer_email_owned_by_other_user` también
 * salta cuando la ficha dueña del email es un invitado sin cuenta o en la
 * carrera por PK — prometer "otra cuenta" sería falso. Fusionar es manual.
 */
export default function EmailConflict() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-20">
      <EmptyState
        icon="user"
        title="No pudimos abrir tu cuenta"
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
      <Link href="/" className="label-sm mt-8 text-center text-bone-mute transition-colors hover:text-gold">
        ← Volver al inicio
      </Link>
    </main>
  );
}
