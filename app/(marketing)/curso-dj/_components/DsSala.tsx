import BrandImage from "@/components/BrandImage";
import { GEAR } from "@/lib/site";
import { cursoPhotos, getPhotos } from "@/lib/photos";
import DsSectionHead from "./DsSectionHead";

const ROLE: Record<string, string> = {
  Reproductores: "Players",
  "Mixer de 2 canales": "Mixer",
  "Monitores de estudio": "Monitores",
};

export default function DsSala() {
  const foto = cursoPhotos(getPhotos())[0];
  return (
    <section aria-labelledby="sala-h" className="border-y border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <div className="mx-auto grid max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-10 px-5 py-18">
        {foto && (
          <BrandImage
            src={foto.src}
            alt={foto.alt}
            sizes="(min-width: 1024px) 540px, 100vw"
            scrim="bottom"
            className="aspect-[4/3] rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
          />
        )}
        <div className="flex flex-col gap-5">
          <DsSectionHead id="sala-h" eyebrow="La sala y el equipo" title="Aprendes en equipo de club" />
          <p className="m-0 text-[17px] leading-relaxed text-pretty text-[var(--grey-200)]">
            Las mismas máquinas que vas a encontrar en una cabina, en una sala aislada acústicamente
            donde puedes tocar fuerte sin molestar a nadie.
          </p>
          <dl className="m-0 flex flex-col border-t border-[var(--border-strong)]">
            {GEAR.map((g) => (
              <div key={g.model} className="flex justify-between gap-4 border-b border-[var(--border-strong)] py-3.5">
                <dt className="text-[15px] text-[var(--text-secondary)]">{ROLE[g.role] ?? g.role}</dt>
                <dd className="ds-mono m-0 text-right text-[15px]">
                  {g.qty === "1×" ? "" : `${g.qty} `}
                  {g.model}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-b border-[var(--border-strong)] py-3.5">
              <dt className="text-[15px] text-[var(--text-secondary)]">Sala</dt>
              <dd className="ds-mono m-0 text-right text-[15px]">Aislada acústicamente</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
