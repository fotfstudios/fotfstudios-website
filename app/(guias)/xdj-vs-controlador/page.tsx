import type { Metadata } from "next";
import Link from "next/link";
import { GuideSection, guideJsonLd } from "../_components/Prose";
import { GEAR } from "@/lib/site";

const DESCRIPTION =
  "¿Aprender DJ en un controlador o en equipos de club (XDJ/CDJ)? Diferencias reales, la trampa del traspaso, y cuándo conviene cada uno.";

export const metadata: Metadata = {
  title: "¿Controlador o equipos de club para aprender DJ?",
  description: DESCRIPTION,
  alternates: { canonical: "/xdj-vs-controlador" },
};

const jsonLd = guideJsonLd({
  slug: "xdj-vs-controlador",
  headline: "¿Controlador o equipos de club para aprender DJ?",
  description: DESCRIPTION,
  datePublished: "2026-08-17",
});

const enlace =
  "text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold";

export default function XdjVsControladorPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <p className="label mt-10 text-gold">Guía</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        ¿Controlador o equipos de club?
      </h1>
      <p className="font-editorial mt-4 max-w-xl text-xl text-bone-dim">
        Aprende donde vas a tocar.
      </p>

      <p className="mt-8 leading-relaxed text-bone-dim">
        Es la primera decisión de todo principiante y condiciona las siguientes: ¿parto con un
        controlador en casa o aprendo directamente en los equipos que hay en una cabina? Las dos
        rutas funcionan. Pero no son equivalentes, y la diferencia aparece justo cuando más
        duele: la primera vez que tocas fuera de tu pieza.
      </p>

      <GuideSection title="Qué es un controlador">
        <p>
          Una superficie de control conectada a un computador: el software (Rekordbox, Serato)
          hace el trabajo y el controlador lo comanda. Ventajas reales: precio de entrada bajo,
          practicas en casa a cualquier hora, y es portátil. Costos ocultos: dependes del laptop,
          el layout rara vez coincide con el estándar de cabina, y el botón de sync hace tan fácil
          saltarse el beatmatching que muchos nunca lo aprenden.
        </p>
      </GuideSection>

      <GuideSection title="Qué es un XDJ/CDJ">
        <p>
          El reproductor standalone estándar de la industria: pinchas desde un USB, sin
          computador, con el layout que se repite — con variaciones menores — en prácticamente
          todas las cabinas del mundo. Es más caro de comprar, y por eso casi nadie lo compra
          para aprender: se aprende en salas equipadas, pagando por hora solo el tiempo que usas.
        </p>
      </GuideSection>

      <GuideSection title="La trampa del traspaso">
        <p>
          El patrón se repite: meses practicando en controlador con sync, primera oportunidad
          real, y en la cabina hay dos reproductores y un mixer que no se parecen a nada de lo que
          conoces. Sin sync, sin tus atajos, con la pista mirando. El traspaso controlador→cabina
          es posible, pero es una segunda curva de aprendizaje — y suele llegar en el peor
          momento. Aprender directo en el equipo estándar elimina esa curva de raíz.
        </p>
      </GuideSection>

      <GuideSection title="Nuestra postura (y en qué equipos)">
        <p>
          Aprende donde vas a tocar. La cabina de FOTF Studios en Viña del Mar está montada con
          el estándar:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {GEAR.map((g) => (
            <li key={g.model}>
              <strong className="text-bone">
                {g.qty} {g.model}
              </strong>{" "}
              — {g.role}
            </li>
          ))}
        </ul>
        <p>
          No necesitas comprar nada de eso: la sala se arrienda por hora, y el{" "}
          <Link href="/curso-dj" className={enlace}>
            curso de DJ
          </Link>{" "}
          se dicta completo en estos equipos — 4 sesiones, práctica libre incluida y tu set final
          grabado. Si ya tienes controlador, no lo botes: sirve para preparar sets en casa. Pero
          el oído y las manos entrénalos en el equipo real. Por dónde partir, paso a paso:{" "}
          <Link href="/aprender-dj" className={enlace}>
            Cómo aprender a ser DJ desde cero
          </Link>
          .
        </p>
      </GuideSection>
    </>
  );
}
