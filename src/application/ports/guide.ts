import type { GuideLeadInput } from "@/src/domain/guide/lead";

/** Resultado de pedir la guía: token estable por email + si es la primera vez. */
export interface GuideLeadRequest {
  id: string;
  token: string;
  isNew: boolean;
}

export interface GuideLeadRepository {
  /** Alta o re-pedido (idempotente por email): mismo token, cuenta el re-pedido. */
  request(input: GuideLeadInput): Promise<GuideLeadRequest>;
  /** Marca la descarga y dice si el token existe. Nunca de un solo uso. */
  touchDownload(token: string): Promise<boolean>;
}

export interface GuideFileStore {
  /** URL firmada de corta vida al objeto del bucket, o null si el archivo no está. */
  signedDownloadUrl(objectPath: string, ttlSeconds: number): Promise<string | null>;
}
