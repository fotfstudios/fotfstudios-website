import { GEAR } from "@/lib/site";

/**
 * El equipo de la sala, leído de lib/site.ts.
 *
 * Existe para que la prosa NO repita los modelos a mano: si mañana cambia un equipo, los
 * artículos se actualizan solos y no queda un XDJ fantasma en un texto de hace un año.
 * Los modelos exactos son regla de marca, no detalle.
 */
export function Gear() {
  return (
    <div className="mt-6">
      {GEAR.map((g) => (
        <div
          key={g.model}
          className="flex items-baseline justify-between gap-6 border-t hairline py-3"
        >
          <span className="text-bone">
            {g.qty} {g.model}
          </span>
          <span className="label-sm shrink-0 text-bone-mute">{g.role}</span>
        </div>
      ))}
    </div>
  );
}
