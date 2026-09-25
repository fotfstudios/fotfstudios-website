import type { NewsletterSubscriberRow, NovedadesListQuery } from "@/src/domain/admin/novedades-list";
import type { NewsletterSubscribeInput } from "@/src/domain/newsletter/subscribe";

export interface NewsletterSubscription {
  id: string;
  unsubscribeToken: string;
  /** Alta nueva o re-alta después de una baja: corresponde el correo de bienvenida. */
  welcome: boolean;
}

export interface NewsletterRepository {
  /** Alta o re-alta (idempotente por email). Una re-alta renueva el consentimiento. */
  subscribe(input: NewsletterSubscribeInput): Promise<NewsletterSubscription>;
  /** Baja idempotente por token: el email si el token existe, null si no. */
  unsubscribe(token: string): Promise<string | null>;
  /** Admin: página filtrada + total filtrado + conteos por estado. */
  list(query: NovedadesListQuery): Promise<{
    rows: NewsletterSubscriberRow[];
    total: number;
    counts: { activos: number; bajas: number; todos: number };
  }>;
  /** Admin: suscriptores activos en orden cronológico (para el CSV). */
  exportActive(limit: number): Promise<NewsletterSubscriberRow[]>;
}
