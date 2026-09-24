import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuideFileStore } from "@/src/application/ports/guide";
import type { Database } from "@/src/infrastructure/db/database.types";

/** Bucket privado del PDF (`guias`). Solo el service role firma; nunca hay URL pública. */
const BUCKET = "guias";

export class SupabaseGuideFileStore implements GuideFileStore {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * URL firmada de corta vida, o null si el objeto no está (archivo aún no subido).
   * `download` hace que Storage responda `Content-Disposition: attachment`: el PDF se
   * guarda en el dispositivo en vez de abrirse en el visor del navegador.
   */
  async signedDownloadUrl(objectPath: string, ttlSeconds: number, downloadName: string): Promise<string | null> {
    const { data, error } = await this.db.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, ttlSeconds, { download: downloadName });
    if (error) {
      // Storage responde 404 "Object not found" cuando el archivo no existe: es el único
      // error que la app trata como estado ("no disponible"); el resto sí es una falla.
      if (/not found/i.test(error.message)) return null;
      throw new Error(error.message);
    }
    return data.signedUrl;
  }
}
