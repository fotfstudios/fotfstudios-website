import type { Metadata } from "next";
import Link from "next/link";
import { GuideSection, guideJsonLd } from "../_components/Prose";
import { GEAR } from "@/lib/site";

const DESCRIPTION =
  "Guía honesta para aprender a ser DJ desde cero: qué equipo necesitas (y cuál no), cuánto demora, y cuándo conviene un curso de DJ frente al camino autodidacta.";

export const metadata: Metadata = {
  title: "Cómo aprender a ser DJ desde cero",
  description: DESCRIPTION,
  alternates: { canonical: "/aprender-dj" },
};

const jsonLd = guideJsonLd({
  slug: "aprender-dj",
  headline: "Cómo aprender a ser DJ desde cero",
  description: DESCRIPTION,
  datePublished: "2026-08-17",
});

const enlace =
  "text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold";

export default function AprenderDjPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <p className="label mt-10 text-gold">Guía</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        Cómo aprender a ser DJ desde cero
      </h1>
      <p className="font-editorial mt-4 max-w-xl text-xl text-bone-dim">
        Sin humo: qué necesitas de verdad, cuánto demora y por dónde partir.
      </p>

      <p className="mt-8 leading-relaxed text-bone-dim">
        Aprender a mezclar no es un misterio: es una habilidad física y de oído que se entrena,
        como tocar un instrumento. La diferencia entre quien avanza y quien se estanca casi
        nunca es el talento — es tener acceso a equipos reales, práctica regular y alguien que
        corrija los vicios a tiempo. Esta guía resume el camino completo.
      </p>

      <GuideSection title="Qué es mezclar, en una frase">
        <p>
          Mezclar es pasar de una canción a otra sin que la pista lo sienta: igualar velocidades
          (beatmatching), alinear frases y administrar la energía con la ecualización y el
          volumen. Todo lo demás — efectos, scratch, producción — es opcional y viene después.
          Si dominas ganancia, EQ y una transición limpia, ya eres capaz de sostener una hora de
          música.
        </p>
      </GuideSection>

      <GuideSection title="¿Necesito comprar equipo?">
        <p>
          No para partir. Es el error más caro del principiante: gastar cientos de miles en un
          controlador antes de saber si esto le gusta. Hay dos caminos:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-bone">Controlador en casa</strong> — barato de entrada,
            práctico para ejercitar, pero el layout y el flujo difieren de los equipos que vas a
            encontrar en una cabina real.
          </li>
          <li>
            <strong className="text-bone">Practicar por hora en equipos de club</strong> — pagas
            solo las horas que usas, en el mismo equipo estándar de la industria
            ({GEAR.map((g) => g.model).join(", ")}). Es exactamente el modelo de nuestra sala en
            Viña del Mar.
          </li>
        </ul>
        <p>
          Escribimos una comparación completa en{" "}
          <Link href="/xdj-vs-controlador" className={enlace}>
            ¿Controlador o equipos de club?
          </Link>
        </p>
      </GuideSection>

      <GuideSection title="¿Cuánto demora?">
        <p>
          Con método y equipos reales: tus primeras transiciones limpias salen en las primeras
          horas de práctica; un set coherente de 45–60 minutos, en unas semanas de práctica
          constante. Sin método, el mismo camino puede tomar meses de tutoriales sueltos, porque
          nadie te dice qué vicio estás automatizando. La constancia importa más que las
          maratones: rinde más una hora concentrada dos veces por semana que cinco horas un
          sábado al mes.
        </p>
      </GuideSection>

      <GuideSection title="¿Autodidacta o curso de DJ?">
        <p>
          Honestamente: se puede aprender solo. YouTube es gratis y el material sobra. Lo que un
          buen curso de DJ comprime es el tiempo — método en vez de tutoriales sueltos, equipos
          de club sin comprarlos, y un DJ al lado que corrige en el momento lo que un video no
          ve. Si eliges curso, exige tres cosas: horas de práctica real incluidas (no solo
          mirar), equipos estándar de cabina, y algo concreto al final que muestre tu avance.
        </p>
        <p>
          Sobre precios y cómo comparar,{" "}
          <Link href="/cuanto-cuesta-un-curso-de-dj" className={enlace}>
            ¿Cuánto cuesta un curso de DJ?
          </Link>
        </p>
      </GuideSection>

      <GuideSection title="Un método de 4 pasos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-bone">Sonido y primera transición</strong> — ganancia, EQ,
            cue. Sales mezclando dos tracks.
          </li>
          <li>
            <strong className="text-bone">Beatmatching manual</strong> — cuadrar a oído, sin
            sync. La base de todo.
          </li>
          <li>
            <strong className="text-bone">Armado de set</strong> — selección, orden y energía
            durante una hora que fluye.
          </li>
          <li>
            <strong className="text-bone">Set final grabado</strong> — tocar completo y llevarte
            la evidencia.
          </li>
        </ul>
        <p>
          Ese es exactamente el programa de nuestro{" "}
          <Link href="/curso-dj" className={enlace}>
            curso de DJ en Viña del Mar
          </Link>
          : 4 sesiones, 12 horas de estudio y tu set final grabado en audio y video. Y si
          prefieres partir solo, la sala se arrienda por hora — el método de arriba funciona
          igual.
        </p>
      </GuideSection>
    </>
  );
}
