import { GUIDES, type GuideSlug } from "@/lib/guides";

/**
 * Vista de las guías para los artículos: lo poco que hace falta para enlazar una.
 *
 * Deriva de lib/guides.ts, que es EL registro. Antes esto era una tabla propia y había dos
 * listas de guías conviviendo — arreglado al generalizar el servidor.
 */
export type LeadMagnetSlug = GuideSlug;

export const LEAD_MAGNETS = GUIDES;
export const LEAD_MAGNET_SLUGS = Object.keys(GUIDES) as LeadMagnetSlug[];
export const isLeadMagnetSlug = (s: string): s is LeadMagnetSlug => Object.hasOwn(GUIDES, s);
