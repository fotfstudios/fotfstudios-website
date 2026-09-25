import { formatCLP } from "@/lib/pricing";
import { GEAR } from "@/lib/site";
import { PRECIOS } from "@/lib/curso-content";
import Button from "../_ds/Button";

export default function DsHero() {
  return (
    <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 pt-12 pb-14 md:pt-20">
      <div className="flex flex-wrap items-center gap-3">
        <span className="ds-mono rounded-[4px] bg-[var(--accent)] px-2 py-[3px] text-[13px] font-bold text-[var(--text-inverse)]">
          1:1
        </span>
        <span className="ds-eyebrow text-[var(--text-secondary)]">Curso de iniciación DJ · Viña del Mar</span>
      </div>

      <h1 className="ds-h1">
        Aprende a mezclar <span className="text-[var(--accent)]">desde cero</span>
      </h1>

      <p className="m-0 max-w-[640px] text-[clamp(17px,2.2vw,21px)] leading-normal text-pretty text-[var(--grey-200)]">
        Uno a uno con un DJ, en equipos Pioneer de club, en nuestra sala aislada acústicamente en
        Viña del Mar. Partes cuando quieras.
      </p>

      <div className="flex max-w-[440px] flex-col gap-3">
        <Button size="lg" glow fullWidth href="#reserva">
          Reserva tu sesión de prueba · {formatCLP(PRECIOS.prueba)}
        </Button>
        <p className="m-0 text-sm leading-snug text-[var(--text-muted)]">
          1 hora. Se descuenta completa del curso si te inscribes dentro de 7 días.
        </p>
      </div>

      <div className="ds-mono flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-sm text-[var(--text-secondary)]">
        <span>{GEAR.map((g) => `${g.qty === "1×" ? "" : `${g.qty} `}${g.model.replace(/^Pioneer (DJ )?/, "")}`).join(" + ")}</span>
        <span aria-hidden="true" className="h-[5px] w-[5px] rounded-[1px] bg-[var(--accent)]" />
        <span>Sala aislada acústicamente</span>
      </div>
    </section>
  );
}
