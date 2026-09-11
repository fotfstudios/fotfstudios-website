import type { NotificationService } from "@/src/application/notifications/notification-service";

/**
 * Ventana de envío. El cron corre cada 5 minutos y el objetivo es "10 minutos
 * antes": con una ventana de exactamente 10, una reserva puede caer ENTRE dos
 * corridas y no recibir nunca su código. 15 cubre el hueco; el email llega entre
 * 10 y 15 minutos antes.
 */
export const ACCESS_SEND_WINDOW_MINUTES = 15;

/** Lo que el servicio necesita del repositorio; el adaptador real vive en admin-repository. */
export interface AccessCodeRepository {
  assignMissingAccessCodes(): Promise<number>;
  accessCodesDue(
    windowMinutes: number,
  ): Promise<{ id: string; code: string; startsAt: string; customerName: string | null; customerEmail: string | null }[]>;
  markAccessSent(reservationId: string): Promise<boolean>;
  releaseAccessSent(reservationId: string): Promise<void>;
}

export interface AccessSweepResult {
  generated: number;
  sent: number;
  /** Reservas debidas sin email: no hay a quién mandar. El dueño las ve en la ficha. */
  skippedNoEmail: number;
}

/**
 * El barrido del PIN de la cerradura, que corre cada 5 minutos desde pg_cron.
 *
 * Dos mitades en una pasada: asigna código a toda reserva confirmada que no lo
 * tenga, y manda el de las que empiezan dentro de la ventana Y ya están
 * cargadas en la cerradura. Esa segunda condición no es opcional: sin ella el
 * cliente recibiría un código que todavía no abre.
 */
export class AccessCodeService {
  constructor(
    private readonly repo: AccessCodeRepository,
    private readonly notifications: Pick<NotificationService, "notifyAccessCode">,
  ) {}

  async sweep(windowMinutes = ACCESS_SEND_WINDOW_MINUTES): Promise<AccessSweepResult> {
    const generated = await this.repo.assignMissingAccessCodes();

    let sent = 0;
    let skippedNoEmail = 0;
    for (const r of await this.repo.accessCodesDue(windowMinutes)) {
      if (!r.customerEmail) {
        skippedNoEmail++;
        continue;
      }
      // RECLAMAR antes de mandar, y solo si nadie lo reclamó ya: dos corridas del
      // cron solapadas no pueden mandar el mismo PIN dos veces. Si el correo falla,
      // se SUELTA el reclamo: la próxima corrida reintenta (acotado: cuando la
      // sesión ya empezó, `accessCodesDue` deja de devolverla). Dejarla marcada
      // mostraría "Enviado" en la ficha cuando el cliente no recibió nada.
      const claimed = await this.repo.markAccessSent(r.id);
      if (!claimed) continue;
      try {
        await this.notifications.notifyAccessCode({
          email: r.customerEmail,
          name: r.customerName,
          startsAt: r.startsAt,
          code: r.code,
        });
        sent++;
      } catch (e) {
        console.error("[access-codes:send]", r.id, e);
        await this.repo.releaseAccessSent(r.id).catch((e2) => console.error("[access-codes:release]", r.id, e2));
      }
    }
    return { generated, sent, skippedNoEmail };
  }
}
