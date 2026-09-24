import type { GuideLeadRow, GuiaLeadsListQuery } from "@/src/domain/admin/guia-leads-list";
import type { GuideLeadInput } from "@/src/domain/guide/lead";

/** Resultado de pedir una guía: token estable por (guía, email) + si es la primera vez. */
export interface GuideLeadRequest {
  id: string;
  token: string;
  isNew: boolean;
}

export interface GuideLeadRepository {
  /** Alta o re-pedido (idempotente por (guía, email)): mismo token, cuenta el re-pedido. */
  request(input: GuideLeadInput): Promise<GuideLeadRequest>;
  /**
   * Marca la descarga y devuelve a QUÉ GUÍA pertenece el token (null = desconocido).
   * Devuelve la guía y no un booleano para resolver el PDF sin una segunda consulta.
   * Nunca de un solo uso.
   */
  touchDownload(token: string): Promise<{ guideSlug: string } | null>;
  /**
   * Admin: página de leads (más reciente primero) + total filtrado + total general +
   * cuántos hay por guía. Los `slugs` entran por argumento: el repositorio no tiene por
   * qué saber qué guías existen, solo contar las que le pidan.
   */
  list(
    query: GuiaLeadsListQuery,
    slugs: readonly string[],
  ): Promise<{
    rows: GuideLeadRow[];
    total: number;
    grandTotal: number;
    countsByGuide: Record<string, number>;
  }>;
  /** Admin: los leads en orden cronológico, filtrados por guía si se pide (para el CSV). */
  exportAll(query: { guide: string | null; limit: number }): Promise<GuideLeadRow[]>;
}

export interface GuideFileStore {
  /**
   * URL firmada de corta vida al objeto del bucket, servida como adjunto con
   * `downloadName` (el navegador la descarga en vez de abrirla). null si el archivo no está.
   */
  signedDownloadUrl(objectPath: string, ttlSeconds: number, downloadName: string): Promise<string | null>;
}

/**
 * El catálogo de guías tal como lo ve la capa de aplicación: claves, no copy de página.
 *
 * Es un puerto y no un import de lib/guides para que la aplicación no dependa de dónde
 * vive el registro — el único que los une es el composition root.
 */
export interface GuideCatalog {
  /**
   * El PDF de la guía: clave del objeto en el bucket y nombre de descarga, o null si la
   * guía no está en el registro.
   */
  pdfFile(slug: string): { object: string; downloadName: string } | null;
  /** Copy del correo de entrega, o null. */
  emailCopy(slug: string): GuideEmailCopy | null;
  /** Ruta de la landing ("/guia-dj"): el link de descarga del correo cuelga de ahí. */
  landingPath(slug: string): string | null;
}

/** Lo que el correo de entrega necesita saber. Espejo de lib/guides.GuideEmailCopy. */
export interface GuideEmailCopy {
  readonly templateKey: string;
  readonly subject: string;
  readonly preheader: string;
  readonly h1: string;
  readonly blurb: string;
  readonly ctaLabel: string;
  readonly name: string;
  readonly quickStart?: readonly { readonly lead: string; readonly body: string }[];
}
