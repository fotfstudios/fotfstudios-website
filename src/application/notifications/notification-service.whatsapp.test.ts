import { TRANSFER } from "@/lib/site";
import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository, OrderEmailData } from "@/src/application/ports/notifications";
import type { WhatsAppOutbox, WhatsAppOutboxEntry } from "@/src/application/ports/whatsapp";
import { NotificationService } from "./notification-service";

/**
 * Fan-out a WhatsApp desde los notify*: qué se encola, con qué parámetros y clave, y cuándo NO.
 * La cola va falsa (graba); el envío real lo hace el worker y se prueba aparte.
 */
const STARTS = "2030-07-12T18:00:00Z";
const ENDS = "2030-07-12T20:00:00Z";
const OWNER = "56911112222";

const order = (over: Partial<OrderEmailData> = {}): OrderEmailData => ({
  id: "o1",
  kind: "booking",
  email: "ana@e.cl",
  name: "Ana",
  amount: 30000,
  currency: "CLP",
  startsAt: STARTS,
  endsAt: ENDS,
  notifiedAt: null,
  paymentMethod: "transferencia",
  lines: [{ description: "Sala 2 h", subtotal: 30000 }],
  reservationId: "r1",
  phone: "+56912345678",
  whatsappOptIn: true,
  ...over,
});

function make(o: { order?: OrderEmailData | null; outbox?: boolean; owner?: string | null } = {}) {
  const sent: WhatsAppOutboxEntry[] = [];
  const outbox: WhatsAppOutbox = { enqueue: vi.fn(async (e: WhatsAppOutboxEntry) => void sent.push(e)) };
  const mailer = { send: vi.fn(async () => {}) };
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
      ownerEmail: "",
      siteUrl: "https://www.fotfstudios.cl",
      tz: "America/Santiago",
      address: "Los Chercanes 78a, Viña del Mar",
      mapsUrl: "https://maps",
      whatsappUrl: "https://wa.me/56962803298",
      termsUrl: "https://www.fotfstudios.cl/terminos",
      privacyUrl: "https://www.fotfstudios.cl/privacidad",
      transfer: TRANSFER,
      ownerWhatsapp: o.owner === undefined ? OWNER : o.owner,
    },
    o.outbox === false ? null : outbox,
  );
  return { service, sent, mailer, outbox };
}

const byEvent = (sent: WhatsAppOutboxEntry[], event: string) => sent.find((e) => e.event === event);

describe("notifyOrder → booking_confirmed + owner_new_booking", () => {
  it("encola al cliente (botón al recibo) y al dueño (botón al panel), vencen al inicio de la sesión", async () => {
    const { service, sent } = make();
    await service.notifyOrder("o1");
    expect(byEvent(sent, "booking_confirmed")).toEqual({
      event: "booking_confirmed",
      to: "56912345678",
      template: {
        name: "fotf_reserva_confirmada",
        language: "es",
        params: { nombre: "Ana", fecha: "viernes 12 de julio de 2030, 14:00–16:00 h", total: "$30.000" },
        buttonSuffix: "o1",
      },
      dedupeKey: "booking_confirmed:o1",
      expiresAt: new Date(STARTS).toISOString(),
      entity: { kind: "order", id: "o1" },
    });
    expect(byEvent(sent, "owner_new_booking")).toMatchObject({
      to: OWNER,
      template: { name: "fotf_admin_nueva_reserva", params: { cliente: "Ana" }, buttonSuffix: "r1" },
      dedupeKey: "owner_new_booking:o1",
    });
  });

  it("sin consentimiento: solo el dueño", async () => {
    const { service, sent } = make({ order: order({ whatsappOptIn: false }) });
    await service.notifyOrder("o1");
    expect(sent.map((e) => e.event)).toEqual(["owner_new_booking"]);
  });

  // fotf_reserva_confirmada promete el código de acceso: la prueba del curso es guiada.
  it("prueba del curso: al alumno solo el correo (sin PIN que prometer); el dueño sí", async () => {
    const { service, sent } = make({ order: order({ kind: "trial" }) });
    await service.notifyOrder("o1");
    expect(sent.map((e) => e.event)).toEqual(["owner_new_booking"]);
  });

  it("con consentimiento pero un fijo: solo el dueño", async () => {
    const { service, sent } = make({ order: order({ phone: "+56 2 2345 6789" }) });
    await service.notifyOrder("o1");
    expect(sent.map((e) => e.event)).toEqual(["owner_new_booking"]);
  });

  it("sin OWNER_WHATSAPP: solo el cliente", async () => {
    const { service, sent } = make({ owner: null });
    await service.notifyOrder("o1");
    expect(sent.map((e) => e.event)).toEqual(["booking_confirmed"]);
  });

  it("canal apagado (outbox null): manda el correo y no encola nada", async () => {
    const { service, mailer } = make({ outbox: false });
    expect(await service.notifyOrder("o1")).toBe(true);
    expect(mailer.send).toHaveBeenCalled();
  });

  it("una cola caída no voltea la confirmación (el correo ya salió, el reclamo se mantiene)", async () => {
    const { service, outbox } = make();
    vi.mocked(outbox.enqueue).mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.notifyOrder("o1")).toBe(true);
    err.mockRestore();
  });
});

describe("recordatorio y PIN", () => {
  const base = { email: "ana@e.cl", name: "Ana", startsAt: STARTS, phone: "+56912345678", whatsappOptIn: true };

  it("recordatorio: fecha completa y dirección, clave por reserva, vence al inicio", async () => {
    const { service, sent } = make();
    await service.notifyReminder({ ...base, orderId: "o1", endsAt: ENDS, reservationId: "r1" });
    expect(sent).toEqual([
      expect.objectContaining({
        event: "session_reminder",
        dedupeKey: "session_reminder:r1",
        expiresAt: new Date(STARTS).toISOString(),
        template: expect.objectContaining({
          params: { nombre: "Ana", fecha: "viernes 12 de julio de 2030, 14:00–16:00 h", direccion: "Los Chercanes 78a, Viña del Mar" },
        }),
      }),
    ]);
  });

  it("PIN: hora local, el código y gracia de 30 min; la clave lleva el código (un PIN corregido viaja)", async () => {
    const { service, sent } = make();
    await service.notifyAccessCode({ ...base, code: "482913", reservationId: "r1" });
    expect(sent[0]).toMatchObject({
      event: "access_pin",
      dedupeKey: "access_pin:r1:482913",
      expiresAt: new Date(new Date(STARTS).getTime() + 30 * 60_000).toISOString(),
      template: { name: "fotf_pin_acceso", params: { nombre: "Ana", hora: "14:00", pin: "482913" } },
    });
  });

  it("sin reservationId (llamada vieja) no encola", async () => {
    const { service, sent } = make();
    await service.notifyAccessCode({ ...base, code: "1" });
    await service.notifyReminder({ ...base, orderId: null, endsAt: null });
    expect(sent).toEqual([]);
  });

  it("una sesión que ya empezó no encola el recordatorio", async () => {
    const { service, sent } = make();
    await service.notifyReminder({ ...base, startsAt: "2020-01-01T10:00:00Z", orderId: null, endsAt: null, reservationId: "r1" });
    expect(sent).toEqual([]);
  });
});

describe("pago pendiente", () => {
  it("al crear: cliente (con plazo) y dueño; vencen con el plazo de pago", async () => {
    const { service, sent } = make();
    await service.notifyBookingHeld("o1", { clockStart: new Date().toISOString() });
    const c = byEvent(sent, "payment_pending")!;
    expect(c).toMatchObject({ dedupeKey: "payment_pending:o1", template: { name: "fotf_pago_pendiente", buttonSuffix: "o1" } });
    expect(Object.keys(c.template.params).sort()).toEqual(["fecha", "nombre", "plazo", "total"]);
    expect(new Date(c.expiresAt).getTime()).toBeLessThanOrEqual(new Date(STARTS).getTime());
    expect(byEvent(sent, "owner_payment_pending")).toMatchObject({ to: OWNER, template: { buttonSuffix: "r1" } });
  });

  it("recordatorio de pago: solo el cliente", async () => {
    const { service, sent } = make();
    await service.notifyPaymentReminder("o1", { clockStart: new Date().toISOString() });
    expect(sent.map((e) => e.event)).toEqual(["payment_reminder"]);
    expect(sent[0].dedupeKey).toBe("payment_reminder:o1");
  });
});

describe("alertas al dueño", () => {
  it("cancelación: solo con notifyOwner (reembolso externo), con el monto", async () => {
    const { service, sent } = make();
    await service.notifyCancellation("o1", { refundAmount: 30000 });
    expect(sent).toEqual([]);
    await service.notifyCancellation("o1", { refundAmount: 30000, notifyOwner: true });
    expect(sent).toEqual([
      expect.objectContaining({
        event: "owner_cancellation",
        to: OWNER,
        dedupeKey: "owner_cancellation:o1",
        template: expect.objectContaining({ params: { cliente: "Ana", fecha: "viernes 12 de julio de 2030, 14:00–16:00 h", reembolso: "$30.000" } }),
      }),
    ]);
  });

  it("lead del curso: origen, nombre y contacto", async () => {
    const { service, sent } = make();
    await service.notifyCourseLead({ name: "Camila", email: "cami@e.cl", phone: "+56987654321" } as never);
    expect(sent[0]).toMatchObject({
      event: "owner_new_lead",
      to: OWNER,
      template: { params: { origen: "el Curso DJ", nombre: "Camila", contacto: "cami@e.cl · +56987654321" } },
    });
  });

  it("lead de guía: la clave es el token (un reintento no duplica)", async () => {
    const { service, sent } = make();
    await service.notifyGuideLead({ email: "g@e.cl", token: "tok1", landingPath: "/guia-dj", copy: { name: "Guía DJ" } as never });
    expect(sent[0]).toMatchObject({ event: "owner_new_lead", dedupeKey: "owner_new_lead:guia:tok1" });
    expect(sent[0].template.params.origen).toBe("la guía Guía DJ");
  });
});
