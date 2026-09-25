/**
 * Caso de uso del newsletter: suscribirse y darse de baja. Sin IO propio — repositorio y
 * correo entran por puertos, así se prueba con fakes.
 */
import type { NewsletterSubscribeInput } from "@/src/domain/newsletter/subscribe";
import { UNSUBSCRIBE_TOKEN_RE } from "@/src/domain/newsletter/subscribe";
import type { NewsletterRepository } from "@/src/application/ports/newsletter";

export interface NewsletterNotifier {
  notifyNewsletterWelcome(v: { email: string; unsubscribeToken: string }): Promise<void>;
}

export class NewsletterService {
  constructor(
    private readonly repo: NewsletterRepository,
    private readonly notifier: NewsletterNotifier,
  ) {}

  /**
   * Guarda y, solo si es alta nueva o re-alta, manda la bienvenida con el link de baja.
   * El correo es best-effort: la suscripción ya quedó, y un fallo del proveedor no debe
   * decirle a la persona que no quedó suscrita. LoggedMailer deja el fallo en la bitácora.
   */
  async subscribe(input: NewsletterSubscribeInput): Promise<{ welcome: boolean }> {
    const sub = await this.repo.subscribe(input);
    if (sub.welcome) {
      await this.notifier
        .notifyNewsletterWelcome({ email: input.email, unsubscribeToken: sub.unsubscribeToken })
        .catch((e) => console.error("[newsletter:welcome]", e));
    }
    return { welcome: sub.welcome };
  }

  /** Baja por token. Un token con forma inválida ni llega a la base. */
  async unsubscribe(token: string): Promise<{ ok: true; email: string } | { ok: false }> {
    if (!UNSUBSCRIBE_TOKEN_RE.test(token)) return { ok: false };
    const email = await this.repo.unsubscribe(token);
    return email ? { ok: true, email } : { ok: false };
  }
}
