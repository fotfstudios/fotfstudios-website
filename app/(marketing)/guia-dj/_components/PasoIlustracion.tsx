import type { Ilustracion } from "@/lib/guia-content";

/**
 * Pie oscuro de cada paso de la página 4: una ilustración CSS pura (sin JS) + leyenda.
 * Todo `aria-hidden`: es ambiente, el contenido está en el texto del paso. Cada
 * ilustración tiene como estado BASE su cuadro de reposo (pitch calzado, 125.0 BPM,
 * barras alineadas, onda visible): con prefers-reduced-motion se ve eso, quieto.
 */
export default function PasoIlustracion({ kind, caption }: { kind: Ilustracion; caption: string }) {
  return (
    <div className="flex min-h-[106px] items-center justify-between gap-5 border-t border-ink/15 bg-ink px-6 py-4">
      <div aria-hidden className="flex items-center gap-5">
        {kind === "pitch" && <Pitch />}
        {kind === "cue" && <Cue />}
        {kind === "drift" && <Drift />}
        {kind === "wave" && <Wave />}
      </div>
      <span className="label-sm text-right text-bone-quiet">{caption}</span>
    </div>
  );
}

const BPM = ["124.0", "124.3", "124.7", "125.0"] as const;

/** Fader de pitch: la perilla baja en 4 pasos hasta calzar; la tira de BPM la acompaña. */
function Pitch() {
  return (
    <>
      <div className="relative h-[74px] w-10 flex-none">
        <span className="absolute inset-x-0 top-0 text-center font-mono text-xs leading-none text-bone-quiet">−</span>
        <span className="absolute inset-x-0 bottom-0 text-center font-mono text-xs leading-none text-bone-quiet">+</span>
        <span className="absolute bottom-[11px] left-1/2 top-[11px] w-1.5 -translate-x-1/2 border hairline bg-ink-soft" />
        <span className="absolute left-1 right-1 top-1/2 h-0.5 bg-bone" />
        {[16.6, 33.3, 66.6, 83.3].map((t) => (
          <span key={t} className="absolute left-[7px] h-px w-2 bg-graphite" style={{ top: `${t}%` }} />
        ))}
        {[16.6, 33.3, 66.6, 83.3].map((t) => (
          <span key={t} className="absolute right-[7px] h-px w-2 bg-graphite" style={{ top: `${t}%` }} />
        ))}
        <span
          className="animate-guia-pitch absolute left-[5px] right-[5px] top-[58%] -mt-2 h-4 bg-bone shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
        >
          <i className="absolute left-[3px] right-[3px] top-[7px] h-0.5 bg-gold" />
        </span>
      </div>
      <div className="h-[22px] overflow-hidden font-mono text-sm leading-[22px] text-bone">
        {/* Reposo en `transform` (no en la utilidad translate-*: en Tailwind v4 esa escribe
            la propiedad `translate`, que se SUMA al transform de los keyframes). */}
        <div className="animate-guia-bpm" style={{ transform: "translateY(-75%)" }}>
          {BPM.map((v, i) => (
            <div key={v} className={i === BPM.length - 1 ? "text-gold" : ""}>
              {v} BPM
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Cuatro golpes; el primero (el cue) late en Gold. */
function Cue() {
  return (
    <div className="flex h-[38px] items-end gap-2">
      <i className="animate-guia-cue block h-[38px] w-[18px] origin-bottom bg-gold" />
      <i className="block h-[22px] w-[18px] bg-graphite" />
      <i className="block h-[29px] w-[18px] bg-graphite" />
      <i className="block h-[22px] w-[18px] bg-graphite" />
    </div>
  );
}

/** Dos pistas: la de arriba manda; la de abajo llega corrida y se empuja hasta calzar. */
function Drift() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className="block h-4 w-3 bg-bone" />
        ))}
      </div>
      <div className="animate-guia-drift flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className="block h-4 w-3 bg-gold" />
        ))}
      </div>
    </div>
  );
}

/** Forma de onda que se apaga: "escucha, no mires". */
function Wave() {
  return (
    <div className="animate-guia-wave flex h-[38px] items-center gap-1">
      {[14, 29, 20, 38, 16, 27, 11].map((h, i) => (
        <i key={i} className="block w-1.5 bg-bone" style={{ height: h }} />
      ))}
    </div>
  );
}
