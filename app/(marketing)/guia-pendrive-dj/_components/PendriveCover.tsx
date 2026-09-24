import Logo from "@/components/Logo";
import { COPY } from "@/lib/guia-pendrive-content";

/**
 * La portada del PDF como objeto impreso: hoja Bone girada sobre una sombra de papel.
 * Es la portada REAL del PDF (crema, lockup negro), no una foto. Sobre Bone el acento es
 * Ink —Gold no llega a AA sobre crema—; el Gold queda en el motivo de barras.
 */
export default function PendriveCover() {
  return (
    <div aria-hidden className="flex justify-center py-6">
      <div className="relative aspect-[8.5/11] w-[min(78%,400px)]">
        <div className="absolute inset-0 translate-x-[22px] translate-y-[18px] rotate-[4deg] bg-graphite" />
        <div className="absolute inset-0 flex -rotate-2 flex-col gap-4 bg-bone p-[9%_10%] text-ink shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
          <Logo variant="lockup" color="deepblack" height={44} className="self-start" />
          <p className="label-sm mt-auto text-ink/60">{COPY.cover.eyebrow}</p>
          <p className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] leading-[0.95]">
            {COPY.cover.title.map((line, i) => (
              <span key={line} className={`block ${i === COPY.cover.titleAccent ? "underline decoration-gold decoration-[6px] underline-offset-[6px]" : ""}`}>
                {line}
              </span>
            ))}
          </p>
          {/* Motivo de barras (estático: el logo nunca se anima) */}
          <div className="mb-[16%] mt-1 flex gap-[5px]">
            {[60, 26, 38, 20].map((w, i) => (
              <i key={w} className={`block h-[5px] ${i === 0 ? "bg-gold" : "bg-ink"}`} style={{ width: w }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
