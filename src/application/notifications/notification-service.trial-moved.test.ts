import { TRANSFER } from "@/lib/site";
import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository, OrderEmailData } from "@/src/application/ports/notifications";
import type { WhatsAppOutbox, WhatsAppOutboxEntry } from "@/src/application/ports/whatsapp";
import { NotificationService } from "./notification-service";

/**
 * notifyTrialRescheduled: la prueba del curso movida desde el admin avisa al dueño y al
 * cliente, por correo y por WhatsApp. El pedido ya trae el horario NUEVO (el RPC corrió antes).
 */
const OLD_S = "2030-10-08T21:00:00Z"; // martes 8 de octubre, 18:00 en Santiago (UTC-3)
const OLD_E = "2030-10-08T22:00:00Z";
const NEW_S = "2030-10-09T19:00:00Z"; // miércoles 9 de octubre, 16:00
const NEW_E = "2030-10-09T20:00:00Z";
const OWNER_MAIL = "dueno@fotfstudios.cl";
const OWNER_WA = "56911112222";

const order = (over: Partial<OrderEmailData> = {}): OrderEmailData => ({
  id: "o1",
  kind: "trial",
  email: "paulina@e.cl",
  name: "Paulina",
  amount: 19990,
  currency: "CLP",
  startsAt: NEW_S,
  endsAt: NEW_E,
  notifiedAt: "2030-10-01T12:00:00Z",
  paymentMethod: "transferencia",
  lines: [{ description: "Sesión de prueba Curso DJ · 1 h", subtotal: 19990 }],
  reservationId: "r1",
  phone: "+56912345678",
  whatsappOptIn: true,
  ...over,
});

function make(o: { order?: OrderEmailData | null; ownerEmail?: string; ownerWa?: string | null; outbox?: boolean } = {}) {
  const wa: WhatsAppOutboxEntry[] = [];
  const outbox: WhatsAppOutbox = { enqueue: vi.fn(async (e: WhatsAppOutboxEntry) => void wa.push(e)) };
  type Sent = { to: string; template?: string; subject: string; html: string; attachments?: { filename: string; content: string }[] };
  const mailer = { send: vi.fn<(m: Sent) => Promise<void>>(async () => {}) };
  const repo = {
    getOrderForEmail: vi.fn(async () => (o.order === undefined ? order() : o.order)),
    pendingPaidOrderIds: vi.fn(),
    markNotified: vi.fn(async () => true),
    releaseNotified: vi.fn(async () => {}),
  } as unknown as NotificationRepository;
  const service = new NotificationService(
    mailer,
    repo,
    {
      ownerEmail: o.ownerEmail ?? OWNER_MAIL,
      siteUrl: "https://www.fotfstudios.cl",
      tz: "America/Santiago",
      address: "Los Chercanes 78a, Viña del Mar",
      mapsUrl: "https://maps",
      whatsappUrl: "https://wa.me/56962803298",
      termsUrl: "https://www.fotfstudios.cl/terminos",
      privacyUrl: "https://www.fotfstudios.cl/privacidad",
      transfer: TRANSFER,
      ownerWhatsapp: o.ownerWa === undefined ? OWNER_WA : o.ownerWa,
    },
    o.outbox === false ? null : outbox,
  );
  return { service, mailer, wa };
}

const input = { orderId: "o1", reservationId: "r1", oldStartsAt: OLD_S, oldEndsAt: OLD_E };
const mailTo = (mailer: ReturnType<typeof make>["mailer"], to: string) =>
  mailer.send.mock.calls.map((c) => c[0]).find((m) => m.to === to);

describe("notifyTrialRescheduled — correo", () => {
  it("avisa al dueño y al cliente, cada uno con antes → ahora", async () => {
    const { service, mailer } = make();
    expect(await service.notifyTrialRescheduled(input)).toEqual({ owner: true, customer: true });

    const owner = mailTo(mailer, OWNER_MAIL)!;
    expect(owner.template).toBe("ownerTrialRescheduled");
    expect(owner.subject).toBe("Prueba del curso movida — miércoles 9 de octubre de 2030, 16:00–17:00 h");
    expect(owner.html).toContain("martes 8 de octubre de 2030, 18:00–19:00 h");
    expect(owner.html).toContain("paulina@e.cl · +56912345678");
    expect(owner.html).toContain("https://www.fotfstudios.cl/admin/reservas/r1");
    expect(owner.attachments).toBeUndefined();

    const customer = mailTo(mailer, "paulina@e.cl")!;
    expect(customer.template).toBe("trialRescheduled");
    expect(customer.subject).toBe("Prueba del Curso de DJ: nuevo horario · miércoles 9 de octubre de 2030, 16:00–17:00 h");
    expect(customer.html).toContain("martes 8 de octubre de 2030, 18:00–19:00 h");
    expect(customer.html).not.toMatch(/código de acceso te llega/);
  });

  it("el .ics del cliente actualiza el evento de la confirmación (mismo uid) y no promete PIN", async () => {
    const { service, mailer } = make();
    await service.notifyTrialRescheduled(input);
    const ics = mailTo(mailer, "paulina@e.cl")!.attachments![0].content;
    expect(ics).toContain("UID:fotf-o1@fotfstudios.cl");
    expect(ics).toContain("Prueba del Curso de DJ");
    expect(ics).not.toContain("código de acceso");
  });

  it("sin OWNER_EMAIL: solo el cliente", async () => {
    const { service, mailer } = make({ ownerEmail: "" });
    expect(await service.notifyTrialRescheduled(input)).toEqual({ owner: false, customer: true });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("cliente sin email: el dueño igual se entera", async () => {
    const { service, mailer } = make({ order: order({ email: null }) });
    expect(await service.notifyTrialRescheduled(input)).toEqual({ owner: true, customer: false });
    expect(mailTo(mailer, OWNER_MAIL)!.html).toContain("sin email");
  });

  it("si falla el correo al dueño, el del cliente sale igual (y viceversa no lanza)", async () => {
    const { service, mailer } = make();
    mailer.send.mockRejectedValueOnce(new Error("resend down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.notifyTrialRescheduled(input)).toEqual({ owner: false, customer: true });
    expect(mailTo(mailer, "paulina@e.cl")).toBeTruthy();
    err.mockRestore();
  });

  it("pedido sin reserva o inexistente: no manda nada", async () => {
    for (const o of [null, order({ startsAt: null, endsAt: null })]) {
      const { service, mailer, wa } = make({ order: o });
      expect(await service.notifyTrialRescheduled(input)).toEqual({ owner: false, customer: false });
      expect(mailer.send).not.toHaveBeenCalled();
      expect(wa).toHaveLength(0);
    }
  });
});

describe("notifyTrialRescheduled — WhatsApp", () => {
  it("encola la alerta al dueño (botón al panel) y el aviso al cliente (botón al recibo)", async () => {
    const { service, wa } = make();
    await service.notifyTrialRescheduled(input);
    const owner = wa.find((e) => e.event === "owner_trial_rescheduled")!;
    expect(owner.to).toBe(OWNER_WA);
    expect(owner.dedupeKey).toBe(`owner_trial_rescheduled:r1:${NEW_S}`);
    expect(owner.template.params).toEqual({
      cliente: "Paulina",
      antes: "martes 8 de octubre de 2030, 18:00–19:00 h",
      ahora: "miércoles 9 de octubre de 2030, 16:00–17:00 h",
    });
    expect(owner.template.buttonSuffix).toBe("r1");

    const customer = wa.find((e) => e.event === "trial_rescheduled")!;
    expect(customer.dedupeKey).toBe(`trial_rescheduled:r1:${NEW_S}`);
    expect(customer.expiresAt).toBe(new Date(NEW_S).toISOString());
    expect(customer.template.buttonSuffix).toBe("o1");
  });

  it("cliente sin consentimiento: solo la alerta al dueño", async () => {
    const { service, wa } = make({ order: order({ whatsappOptIn: false }) });
    await service.notifyTrialRescheduled(input);
    expect(wa.map((e) => e.event)).toEqual(["owner_trial_rescheduled"]);
  });

  it("sin OWNER_WHATSAPP no hay alerta; sin cola (Kapso apagado) no se encola nada y el correo sale", async () => {
    const a = make({ ownerWa: null });
    await a.service.notifyTrialRescheduled(input);
    expect(a.wa.map((e) => e.event)).toEqual(["trial_rescheduled"]);

    const b = make({ outbox: false });
    expect(await b.service.notifyTrialRescheduled(input)).toEqual({ owner: true, customer: true });
  });
});
