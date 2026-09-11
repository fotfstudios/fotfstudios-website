import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "@/src/application/ports/notifications";
import { NotificationService } from "./notification-service";

const makeService = () => {
  const mailer = { send: vi.fn(async () => {}) };
  const repo = {
    getOrderForEmail: vi.fn(),
    pendingPaidOrderIds: vi.fn(),
    markNotified: vi.fn(),
  } as unknown as NotificationRepository;
  const service = new NotificationService(mailer, repo, {
    ownerEmail: "",
    tz: "America/Santiago",
    address: "Los Chercanes 78a",
    whatsappUrl: "https://wa.me/56962803298",
    termsUrl: "https://www.fotfstudios.cl/terminos",
    privacyUrl: "https://www.fotfstudios.cl/privacidad",
  });
  return { service, mailer, repo };
};

describe("notifyCourtesy", () => {
  it("sin email: no envía nada y devuelve false (sin tocar la DB)", async () => {
    const { service, mailer, repo } = makeService();
    const sent = await service.notifyCourtesy({ email: null, name: "Ana", startsAt: "2026-07-12T18:00:00Z", addonNames: [] });
    expect(sent).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(repo.getOrderForEmail).not.toHaveBeenCalled();
  });

  it("con email: envía al cliente con horario en zona Santiago y extras", async () => {
    const { service, mailer } = makeService();
    const sent = await service.notifyCourtesy({
      email: "ana@e.cl",
      name: "Ana",
      startsAt: "2026-07-12T18:00:00Z",
      addonNames: ["Humo"],
    });
    expect(sent).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.to).toBe("ana@e.cl");
    expect(msg.subject).toMatch(/cortesía/i);
    // 18:00Z → 14:00 en Santiago (UTC-4 en julio, horario de invierno)
    expect(msg.html).toContain("domingo 12 de julio, 14:00 h");
    expect(msg.html).toContain("Humo");
  });

  it("si el mailer falla, el error se propaga (el .catch vive en el call site)", async () => {
    const { service, mailer } = makeService();
    mailer.send.mockRejectedValueOnce(new Error("resend down"));
    await expect(
      service.notifyCourtesy({ email: "ana@e.cl", name: null, startsAt: "2026-07-12T18:00:00Z", addonNames: [] }),
    ).rejects.toThrow("resend down");
  });
});

describe("notifyAccessCode", () => {
  it("sin email: no envía y devuelve false (sin tocar la DB)", async () => {
    const { service, mailer, repo } = makeService();
    const sent = await service.notifyAccessCode({ email: null, name: "Ana", startsAt: "2026-07-12T18:00:00Z", code: "1234" });
    expect(sent).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(repo.getOrderForEmail).not.toHaveBeenCalled();
  });

  it("con email: envía el código con horario en zona Santiago", async () => {
    const { service, mailer } = makeService();
    const sent = await service.notifyAccessCode({
      email: "ana@e.cl",
      name: "Ana",
      startsAt: "2026-07-12T18:00:00Z",
      code: "clave 4471",
    });
    expect(sent).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.to).toBe("ana@e.cl");
    expect(msg.subject).toMatch(/acceso/i);
    expect(msg.html).toContain("domingo 12 de julio, 14:00 h");
    expect(msg.html).toContain("clave 4471");
  });

  it("si el mailer falla, el error se propaga (el .catch vive en el call site)", async () => {
    const { service, mailer } = makeService();
    mailer.send.mockRejectedValueOnce(new Error("resend down"));
    await expect(
      service.notifyAccessCode({ email: "ana@e.cl", name: null, startsAt: "2026-07-12T18:00:00Z", code: "1234" }),
    ).rejects.toThrow("resend down");
  });
});

describe("notifyApplication", () => {
  const makeWithOwner = (ownerEmail: string) => {
    const mailer = { send: vi.fn(async () => {}) };
    const repo = {
      getOrderForEmail: vi.fn(),
      pendingPaidOrderIds: vi.fn(),
      markNotified: vi.fn(),
    } as unknown as NotificationRepository;
    const service = new NotificationService(mailer, repo, {
      ownerEmail,
      tz: "America/Santiago",
      address: "Los Chercanes 78a",
      whatsappUrl: "https://wa.me/56962803298",
      termsUrl: "https://www.fotfstudios.cl/terminos",
      privacyUrl: "https://www.fotfstudios.cl/privacidad",
    });
    return { service, mailer };
  };

  const app = {
    name: "Valentina",
    email: "vale@correo.cl",
    phone: "+56912345678",
    format: "ambas" as const,
    availability: "Tardes de semana",
    mixUrl: "https://soundcloud.com/vale/set",
    instagram: "vale.dj",
    genres: "House, techno",
    pitch: "Llevo 5 años pinchando.",
  };

  it("con ownerEmail: envía dueño PRIMERO y luego postulante", async () => {
    const { service, mailer } = makeWithOwner("dueno@fotf.cl");
    await service.notifyApplication(app);
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.send.mock.calls[0][0].to).toBe("dueno@fotf.cl");
    expect(mailer.send.mock.calls[0][0].subject).toMatch(/postulaci[oó]n de dj/i);
    expect(mailer.send.mock.calls[1][0].to).toBe("vale@correo.cl");
    expect(mailer.send.mock.calls[1][0].subject).toMatch(/recibimos tu postulaci[oó]n/i);
  });

  it("sin ownerEmail: solo envía al postulante", async () => {
    const { service, mailer } = makeWithOwner("");
    await service.notifyApplication(app);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send.mock.calls[0][0].to).toBe("vale@correo.cl");
  });
});

/**
 * El pedido de curso no tiene reserva, así que `startsAt` viene null. Sin esta
 * rama, notifyOrder arma la plantilla de RESERVA con la fecha en "—" y el cron
 * nocturno (que barre toda orden pagada sin notificar) se la manda al alumno.
 */
describe("notifyOrder — un pedido de curso no usa la plantilla de reserva", () => {
  const courseOrder = {
    id: "o-curso",
    kind: "course",
    email: "alumna@correo.cl",
    name: "Camila",
    amount: 159980,
    currency: "CLP",
    startsAt: null,
    endsAt: null,
    notifiedAt: null,
    lines: [{ description: "Curso de Iniciación DJ · G01 · en dúo", subtotal: 159980 }],
  };

  it("no manda la confirmación de reserva", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(courseOrder);

    expect(await service.notifyOrder("o-curso")).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  // Si solo devolviera false, notified_at seguiría en null y el barrido
  // levantaría la misma orden en cada corrida, para siempre.
  it("la marca como notificada para que el barrido converja", async () => {
    const { service, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(courseOrder);

    await service.notifyOrder("o-curso");
    expect(repo.markNotified).toHaveBeenCalledWith("o-curso");
  });

  it("un pedido de reserva normal sigue enviando", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      ...courseOrder,
      kind: "booking",
      startsAt: "2026-09-08T23:00:00Z",
      endsAt: "2026-09-09T01:00:00Z",
    });

    expect(await service.notifyOrder("o-booking")).toBe(true);
    expect(mailer.send).toHaveBeenCalled();
  });
});

/**
 * Link de pago de una reserva pendiente. Hasta este cambio, una reserva creada
 * con método "pendiente" no generaba NINGÚN correo en toda su vida hasta que se
 * pagaba: el cliente no tenía nada por escrito y el dueño tampoco se enteraba.
 */
describe("notifyBookingPaymentLink", () => {
  const ORDER = {
    email: "ana@e.cl",
    name: "Ana",
    amount: 39980,
    startsAt: "2026-07-12T18:00:00Z",
    lines: [],
    kind: "booking",
    notifiedAt: null,
  };

  it("manda el link al cliente, con el horario en zona Santiago", async () => {
    const { service, mailer, repo } = makeService();
    (repo.getOrderForEmail as ReturnType<typeof vi.fn>).mockResolvedValue(ORDER);

    const sent = await service.notifyBookingPaymentLink("o1", { initPoint: "https://mp/x", expiresInHours: 72 });
    expect(sent).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);

    const msg = (mailer.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(msg.to).toBe("ana@e.cl");
    expect(msg.subject).toMatch(/falta el pago/i);
    expect(msg.text).toContain("https://mp/x");
    expect(msg.text).toContain("72 horas");
    expect(msg.html).toContain("https://mp/x");
    // 18:00 UTC = 14:00 en Santiago.
    expect(msg.text).toContain("14:00");
  });

  /**
   * La que importa: marcar `notified_at` acá dejaría al cliente SIN su email de
   * confirmación al pagar y al dueño sin su aviso de reserva pagada, porque
   * `notifyOrder` corta apenas ve esa marca. El link y la confirmación son dos
   * correos distintos en dos momentos distintos.
   */
  it("NO marca la orden como notificada: la confirmación al pagar tiene que salir igual", async () => {
    const { service, mailer, repo } = makeService();
    (repo.getOrderForEmail as ReturnType<typeof vi.fn>).mockResolvedValue(ORDER);

    await service.notifyBookingPaymentLink("o1", { initPoint: "https://mp/x", expiresInHours: 72 });
    expect(repo.markNotified).not.toHaveBeenCalled();

    // Y efectivamente, la confirmación posterior sí sale.
    const enviadosAntes = (mailer.send as ReturnType<typeof vi.fn>).mock.calls.length;
    const confirmado = await service.notifyOrder("o1");
    expect(confirmado).toBe(true);
    expect((mailer.send as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(enviadosAntes);
    expect(repo.markNotified).toHaveBeenCalledWith("o1");
  });

  it("sin email en la reserva no manda nada y devuelve false", async () => {
    const { service, mailer, repo } = makeService();
    (repo.getOrderForEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ ...ORDER, email: null });

    expect(await service.notifyBookingPaymentLink("o1", { initPoint: "https://mp/x", expiresInHours: 72 })).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(repo.markNotified).not.toHaveBeenCalled();
  });

  it("una orden que no existe no revienta", async () => {
    const { service, mailer, repo } = makeService();
    (repo.getOrderForEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    expect(await service.notifyBookingPaymentLink("o1", { initPoint: "https://mp/x", expiresInHours: 72 })).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("manda el link AUNQUE la orden ya esté notificada: son correos distintos", async () => {
    // Caso real: se pagó, se reembolsó y se vuelve a generar un link. El guard
    // de `notified_at` es de la confirmación, no de este correo.
    const { service, mailer, repo } = makeService();
    (repo.getOrderForEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ ...ORDER, notifiedAt: "2026-07-11T00:00:00Z" });

    expect(await service.notifyBookingPaymentLink("o1", { initPoint: "https://mp/x", expiresInHours: 72 })).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});
