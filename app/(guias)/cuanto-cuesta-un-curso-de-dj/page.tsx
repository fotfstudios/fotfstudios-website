import type { Metadata } from "next";
import Link from "next/link";
import { GuideSection, guideJsonLd } from "../_components/Prose";
import { formatCLP, RATES } from "@/lib/pricing";
import { PRECIOS } from "@/app/curso-dj/_content";

const DESCRIPTION =
  "Qué determina el precio de un curso de DJ en Chile, cómo comparar programas — y nuestros precios publicados, sin 'desde' ni formularios de contacto.";

export const metadata: Metadata = {
  title: "¿Cuánto cuesta un curso de DJ?",
  description: DESCRIPTION,
  alternates: { canonical: "/cuanto-cuesta-un-curso-de-dj" },
};

const jsonLd = guideJsonLd({
  slug: "cuanto-cuesta-un-curso-de-dj",
  headline: "¿Cuánto cuesta un curso de DJ?",
  description: DESCRIPTION,
  datePublished: "2026-08-17",
});

const enlace =
  "text-bone-dim underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold";

export default function CuantoCuestaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <p className="label mt-10 text-gold">Guía</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        ¿Cuánto cuesta un curso de DJ?
      </h1>
      <p className="font-editorial mt-4 max-w-xl text-xl text-bone-dim">
        La respuesta corta de casi todas las academias: “contáctanos”. La nuestra: está publicado.
      </p>

      <p className="mt-8 leading-relaxed text-bone-dim">
        Si buscaste “curso de dj” y abriste tres sitios, probablemente viste precios “desde”,
        formularios de contacto o nada. No es casualidad: el precio depende de variables que a
        muchos no les conviene mostrar juntas. Aquí están las variables, cómo comparar — y
        nuestros números completos.
      </p>

      <GuideSection title="Qué determina el precio">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-bone">Horas totales — y de qué tipo.</strong> No es lo mismo
            8 horas mirando una pizarra que 8 horas con las manos en los platos. Pregunta cuántas
            horas son de práctica tuya, no del profesor.
          </li>
          <li>
            <strong className="text-bone">El equipo.</strong> Aprender en un controlador de
            entrada cuesta menos que hacerlo en equipos estándar de cabina (XDJ/CDJ + mixer
            profesional). También transfiere menos: el layout que aprendes es el que dominas.
          </li>
          <li>
            <strong className="text-bone">Alumnos por equipo.</strong> Un grupo de 6 con una
            cabina significa 1/6 del tiempo real de práctica. Los formatos individuales o en dúo
            cuestan más por sesión y rinden más por hora.
          </li>
          <li>
            <strong className="text-bone">Lo que te llevas al final.</strong> ¿Certificado de
            papel o un set grabado que puedes mostrar? Material demostrable vale más que
            diplomas.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Nuestros precios, publicados">
        <p>
          El{" "}
          <Link href="/curso-dj" className={enlace}>
            curso de DJ de FOTF Studios en Viña del Mar
          </Link>{" "}
          incluye en ambos formatos: 8 horas de clase (4 sesiones de 2 horas), 4 horas de
          práctica libre en la sala y tu set final grabado en audio y video.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-bone">En dúo:</strong> {formatCLP(PRECIOS.duo)} por persona.
          </li>
          <li>
            <strong className="text-bone">Individual:</strong> {formatCLP(PRECIOS.individual)}.
          </li>
          <li>
            <strong className="text-bone">Sesión de prueba (1 hora guiada):</strong>{" "}
            {formatCLP(PRECIOS.prueba)}, 100% descontable del curso si te inscribes dentro de una
            semana.
          </li>
        </ul>
        <p>
          IVA incluido, sin letra chica: los mismos números que ves en la página del curso son
          los que pagas.
        </p>
      </GuideSection>

      <GuideSection title="Cómo comparar dos cursos (checklist)">
        <ul className="list-disc space-y-2 pl-5">
          <li>Pide el precio total, no la cuota ni el “desde”.</li>
          <li>Pregunta cuántas horas de práctica real en equipo incluye — por alumno.</li>
          <li>Pregunta en qué equipos exactos vas a aprender (marca y modelo).</li>
          <li>Pregunta cuántos alumnos comparten cada cabina.</li>
          <li>Pregunta qué evidencia concreta te llevas al terminar.</li>
        </ul>
        <p>
          Divide el precio total por las horas de práctica real: ese número — pesos por hora en
          los platos — es la única forma honesta de comparar programas distintos.
        </p>
      </GuideSection>

      <GuideSection title="La alternativa: práctica por hora">
        <p>
          Si prefieres el camino autodidacta, el costo de practicar también está publicado:
          nuestra sala se arrienda desde {formatCLP(RATES.valle)} por hora en horario valle, con
          los mismos equipos del curso. La guía{" "}
          <Link href="/aprender-dj" className={enlace}>
            Cómo aprender a ser DJ desde cero
          </Link>{" "}
          explica cuándo conviene cada camino.
        </p>
      </GuideSection>
    </>
  );
}
