import { dsButtonClass } from "@/components/ds/Button";

/**
 * Invitado tras una reserva confirmada: activar la cuenta es entrar con un código al mismo
 * correo (sin contraseña). Al entrar, las reservas de ese correo se suman a sus Beatcoins.
 */
export default function ActivateAccountCard() {
  return (
    <section aria-labelledby="estado-activate" className="ds-card ds-no-print flex flex-col gap-3.5 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="estado-activate" className="text-[15px] font-medium">
          Activa tu cuenta en un toque
        </h2>
        <p className="text-[13px] text-[var(--text-muted)]">
          Entra con el mismo correo de esta reserva: sin contraseña, te enviamos un código. Ahí ves tus reservas, las
          reagendas y esta reserva suma Beatcoins para las próximas.
        </p>
      </div>
      <div>
        <a href="/cuenta/login" className={dsButtonClass({ variant: "secondary", size: "sm" })}>
          Activar mi cuenta
        </a>
      </div>
    </section>
  );
}
