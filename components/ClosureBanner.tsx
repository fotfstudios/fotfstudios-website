import { CLOSURE, whatsappLink } from "@/lib/site";

/**
 * Franja de cierre temporal. Vive DENTRO del `<header>` fijo del nav, así queda
 * visible en todo el scroll sin pelear z-index ni empujar el layout del hero.
 * Devuelve `null` cuando la sala está abierta — un solo switch en `CLOSURE`.
 */
export default function ClosureBanner() {
  if (!CLOSURE.active) return null;

  return (
    <div role="status" className="bg-sirena text-ink">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2.5 text-center md:px-10">
        <span className="label font-semibold">{CLOSURE.title}</span>
        <span aria-hidden className="hidden opacity-40 sm:inline">
          ·
        </span>
        <span className="label-sm">{CLOSURE.body}</span>
        <a
          href={whatsappLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="label-sm underline decoration-ink/40 underline-offset-4 transition-opacity hover:opacity-70"
        >
          Escríbenos por WhatsApp
        </a>
      </div>
    </div>
  );
}
