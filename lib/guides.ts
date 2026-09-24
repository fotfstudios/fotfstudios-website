import { GUIA } from "@/lib/guia-content";
import { GUIA_PENDRIVE } from "@/lib/guia-pendrive-content";

/**
 * El registro de guías: los imanes de leads en PDF, detrás de un formulario.
 *
 * Acá vive SOLO lo que necesita el servidor —a qué archivo del bucket apunta, qué
 * formularios monta su landing, qué dice su correo— más los pocos campos que un artículo
 * usa para enlazarla. El copy de la landing (COPY, TEMAS, FRAGMENTO…) sigue en su módulo
 * lib/*-content: el contrato del repo es que la copy vive ahí y nunca en un _content local.
 *
 * Una guía nueva se agrega acá; NO necesita una migración. Por eso la base valida la FORMA
 * del slug y no un catálogo cerrado.
 */

/** Un formulario de la landing. `id` es el `source` que viaja al lead. */
export interface GuideFormSource {
  /** Espejo del CHECK `guide_leads_source_valid`: ^[a-z][a-z0-9_]*$, 2–24. */
  readonly id: string;
  /** Etiqueta en la tabla del admin. Vive acá y no en LeadsTable.tsx. */
  readonly label: string;
}

/** Copy del correo de entrega. Se pasa como DATO a templates.ts, que no importa el registro. */
export interface GuideEmailCopy {
  /** Clave estable de notification_log. Convención: `guideDelivery:<slug>`. */
  readonly templateKey: string;
  readonly subject: string;
  readonly preheader: string;
  readonly h1: string;
  /** Una línea: qué trae el PDF. */
  readonly blurb: string;
  readonly ctaLabel: string;
  /** Nombre de la guía en el cuerpo de texto plano. */
  readonly name: string;
  /**
   * Bloque "Por dónde empezar" (numerado 01, 02…): atajos por situación. Opcional: una
   * guía sin él manda el correo de siempre.
   */
  readonly quickStart?: readonly { readonly lead: string; readonly body: string }[];
}

export interface GuideDefinition {
  readonly slug: string;
  /**
   * URL de la landing. LITERAL, no derivada del slug: /guia-dj está rankeada, enlazada
   * desde el footer y desde un artículo. lib/guides.test.ts la pinea.
   */
  readonly path: `/${string}`;
  readonly title: string;
  readonly description: string;
  readonly pages: number;
  /**
   * Clave EXACTA del objeto en el bucket `guias`. El archivo se sube a mano (DEPLOY.md).
   * Convención para guías nuevas: `<slug>/<archivo>.pdf`.
   */
  readonly pdfObject: string;
  /** Los formularios que monta su landing, en orden de aparición. Al menos uno. */
  readonly sources: readonly [GuideFormSource, ...GuideFormSource[]];
  readonly email: GuideEmailCopy;
  /** Línea de servicio para el CTA de un artículo: "PDF · 8 páginas · gratis". */
  readonly kicker: string;
  /** Texto del botón del CTA. */
  readonly cta: string;
}

export const GUIDES = {
  "guia-dj": {
    slug: "guia-dj",
    path: "/guia-dj",
    title: GUIA.title,
    description: GUIA.description,
    pages: GUIA.pages,
    /**
     * Clave HISTÓRICA, en la raíz del bucket. NO "normalizarla" a guia-dj/…:
     * signedDownloadUrl trata un 404 como ESTADO y no como error, así que re-keyear sin
     * re-subir el archivo en prod, staging y local rompe EN SILENCIO todos los links
     * durables ya enviados.
     */
    pdfObject: "guia-iniciacion-djing.pdf",
    sources: [
      { id: "hero", label: "Hero" },
      { id: "fragmento", label: "Fragmento" },
      { id: "cierre", label: "Cierre" },
    ],
    email: {
      templateKey: "guideDelivery:guia-dj",
      subject: "Tu Guía de iniciación al DJing (PDF)",
      preheader: "Tu Guía de iniciación al DJing, en PDF.",
      h1: "Acá está tu guía",
      blurb:
        "Guía de iniciación al DJing, 8 páginas en PDF: el equipo explicado, beatmatching " +
        "paso a paso, EQ, selección musical y una rutina de práctica semanal.",
      ctaLabel: "Descargar la guía (PDF)",
      name: GUIA.title,
    },
    kicker: `PDF · ${GUIA.pages} páginas · gratis`,
    cta: "Descargar la guía",
  },
  "guia-pendrive-dj": {
    slug: "guia-pendrive-dj",
    path: "/guia-pendrive-dj",
    title: GUIA_PENDRIVE.title,
    description: GUIA_PENDRIVE.description,
    pages: GUIA_PENDRIVE.pages,
    /** La clave con la que se subió a prod (raíz del bucket). Re-keyear = re-subir en todos lados. */
    pdfObject: "guia_pendrive_dj_fotf_studios.pdf",
    sources: [
      { id: "hero", label: "Hero" },
      { id: "desbloquear", label: "Desbloquear" },
    ],
    email: {
      templateKey: "guideDelivery:guia-pendrive-dj",
      subject: "Tu guía: Cómo elegir tu pendrive para DJ (PDF)",
      preheader: `${GUIA_PENDRIVE.chapters} capítulos y un checklist para elegir el pendrive correcto.`,
      h1: "Tu guía está lista",
      blurb:
        "Cómo elegir tu pendrive para DJ, en PDF: velocidad, formato, capacidad, materiales, " +
        "cómo prepararlo con Rekordbox y el checklist de compra.",
      ctaLabel: "Descargar la guía (PDF)",
      name: `guía “${GUIA_PENDRIVE.title}”`,
      quickStart: [
        { lead: "¿Vas a comprar pronto?", body: "Ve directo al checklist, al final de la guía." },
        {
          lead: "¿Tienes fecha esta semana?",
          body: "Lee el capítulo 06 para exportar con Rekordbox sin pistas faltantes.",
        },
        { lead: "¿Tocas en clubes distintos?", body: "El capítulo 02 te dice qué formato usar." },
      ],
    },
    kicker: `PDF · ${GUIA_PENDRIVE.chapters} capítulos · gratis`,
    cta: "Descargar la guía",
  },
} as const satisfies Record<string, GuideDefinition>;

export type GuideSlug = keyof typeof GUIDES;
export const GUIDE_SLUGS = Object.keys(GUIDES) as GuideSlug[];
export const isGuideSlug = (s: string): s is GuideSlug => Object.hasOwn(GUIDES, s);

/** El espejo del CHECK vive en el dominio; se re-exporta acá por comodidad. */
export { GUIDE_SLUG_RE } from "@/src/domain/guide/lead";
