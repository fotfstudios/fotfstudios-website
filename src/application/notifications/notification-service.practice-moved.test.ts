import { TRANSFER } from "@/lib/site";
import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository, ReservationContact } from "@/src/application/ports/notifications";
import type { WhatsAppOutbox, WhatsAppOutboxEntry } from "@/src/application/ports/whatsapp";
import { NotificationService } from "./notification-service";

/**
 * notifyPracticeMoved: la práctica movida desde el admin avisa al dueño (con el estado del
 * PIN) y al alumno, por correo y por WhatsApp. La reserva ya trae el horario NUEVO.
 */
const OLD_S = "2030-10-08T21:00:00Z"; // martes 8 de octubre de 2030, 18:00 en Santiago
const OLD_E = "2030-10-08T23:00:00Z";
const NEW_S = "2030-10-09T19:00:00Z"; // miércoles 9, 16:00–18:00
const NEW_E = "2030-10-09T21:00:00Z";
const OWNER_MAIL = "dueno@fotfstudios.cl";
const OWNER_WA = "56911112222";
const BEFORE = "martes 8 de octubre de 2030, 18:00–20:00 h";
const AFTER = "miércoles 9 de octubre de 2030, 16:00–18:00 h";

const contact = (over: Partial<ReservationContact> = {}): ReservationContact => ({
  reservationId: "r1",
  name: "Tomás",
  email: "tomas@e.cl",
  phone: "+56912345678",
  whatsappOptIn: true,
  startsAt: NEW_S,
  endsAt: NEW_E,
  ...over,
});

type Sent = { to: string; template?: string; subject: string; html: string; text: string; attachments?: { filename: string; content: string }[] };

function make(o: { contact?: ReservationContact | null; ownerEmail?: string; ownerWa?: string | null; outbox?: boolean } = {}) {
  const wa: WhatsAppOutboxEntry[] = [];
  const outbox: WhatsAppOutbox = { enqueue: vi.fn(async (e: WhatsAppOutboxEntry) => void wa.push(e)) };
  const mailer = { send: vi.fn<(m: Sent) => Promise<void>>(async () => {}) };
  const repo = {
    getOrderForEmail: vi.fn(),
    getReservationContact: vi.fn(async () => (o.contact === undefined ? contact() : o.contact)),
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

const input = (over = {}) => ({ reservationId: "r1", oldStartsAt: OLD_S, oldEndsAt: OLD_E, accessLoaded: true, ...over });
const mailTo = (mailer: ReturnType<typeof make>["mailer"], to: string) =>
  mailer.send.mock.calls.map((c) => c[0]).find((m) => m.to === to);

describe("notifyPracticeMoved — correo", () => {
  it("avisa al dueño (con el estado del PIN) y al alumno, cada uno con antes → ahora", async () => {
    const { service, mailer } = make();
    expect(await service.notifyPracticeMoved(input())).toEqual({ owner: true, customer: true });

    const owner = mailTo(mailer, OWNER_MAIL)!;
    expect(owner.template).toBe("ownerPracticeMoved");
    expect(owner.subject).toBe(`Práctica del curso movida — ${AFTER}`);
    expect(owner.text).toContain(`Antes: ${BEFORE}`);
    expect(owner.text).toContain("no hay que tocarla");
    expect(owner.html).toContain("https://www.fotfstudios.cl/admin/reservas/r1");
    expect(owner.attachments).toBeUndefined();

    const student = mailTo(mailer, "tomas@e.cl")!;
    expect(student.template).toBe("practiceMoved");
    expect(student.subject).toBe(`Práctica libre: nuevo horario · ${AFTER}`);
    expect(student.text).toContain(`Antes: ${BEFORE}. Ahora: ${AFTER}.`);
  });

  it("PIN sin cargar: el dueño lo ve", async () => {
    const { service, mailer } = make();
    await service.notifyPracticeMoved(input({ accessLoaded: false }));
    expect(mailTo(mailer, OWNER_MAIL)!.text).toContain("El PIN todavía no está cargado");
  });

  it("el .ics actualiza el evento de la práctica agendada (mismo uid) y conserva la promesa del PIN", async () => {
    const { service, mailer } = make();
    await service.notifyPracticeMoved(input());
    const ics = mailTo(mailer, "tomas@e.cl")!.attachments![0];
    expect(ics.filename).toBe("practica-fotf.ics");
    expect(ics.content).toContain("UID:fotf-r-r1@fotfstudios.cl");
    expect(ics.content).toContain("DTSTART:20301009T190000Z");
  });

  it("sin OWNER_EMAIL: solo el alumno; alumno sin email: solo el dueño", async () => {
    const a = make({ ownerEmail: "" });
    expect(await a.service.notifyPracticeMoved(input())).toEqual({ owner: false, customer: true });
    const b = make({ contact: contact({ email: null }) });
    expect(await b.service.notifyPracticeMoved(input())).toEqual({ owner: true, customer: false });
  });

  it("si falla el correo al dueño, el del alumno sale igual", async () => {
    const { service, mailer } = make();
    mailer.send.mockRejectedValueOnce(new Error("resend down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.notifyPracticeMoved(input())).toEqual({ owner: false, customer: true });
    err.mockRestore();
  });

  it("reserva inexistente: no manda nada", async () => {
    const { service, mailer, wa } = make({ contact: null });
    expect(await service.notifyPracticeMoved(input())).toEqual({ owner: false, customer: false });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(wa).toHaveLength(0);
  });
});

describe("notifyPracticeMoved — WhatsApp", () => {
  it("dueño con el estado del PIN y botón al panel; alumno sin botón, vence al nuevo inicio", async () => {
    const { service, wa } = make();
    await service.notifyPracticeMoved(input());
    const owner = wa.find((e) => e.event === "owner_practice_moved")!;
    expect(owner.to).toBe(OWNER_WA);
    expect(owner.dedupeKey).toBe(`owner_practice_moved:r1:${NEW_S}`);
    expect(owner.template.params).toEqual({
      cliente: "Tomás",
      antes: BEFORE,
      ahora: AFTER,
      pin: "sigue cargado, no hay que tocar la cerradura",
    });
    expect(owner.template.buttonSuffix).toBe("r1");

    const student = wa.find((e) => e.event === "practice_moved")!;
    expect(student.dedupeKey).toBe(`practice_moved:r1:${NEW_S}`);
    expect(student.expiresAt).toBe(new Date(NEW_S).toISOString());
    expect(student.template.buttonSuffix).toBeUndefined();
  });

  it("alumno sin consentimiento: solo la alerta al dueño; sin cola: solo correos", async () => {
    const a = make({ contact: contact({ whatsappOptIn: false }) });
    await a.service.notifyPracticeMoved(input());
    expect(a.wa.map((e) => e.event)).toEqual(["owner_practice_moved"]);

    const b = make({ outbox: false });
    expect(await b.service.notifyPracticeMoved(input())).toEqual({ owner: true, customer: true });
  });
});
