import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "@/src/application/ports/notifications";
import { NotificationService } from "./notification-service";

const makeService = () => {
  const mailer = { send: vi.fn(async () => {}) };
  const repo = {
    getOrderForEmail: vi.fn(),
    pendingPaidOrderIds: vi.fn(),
    markNotified: vi.fn(async () => true),
    releaseNotified: vi.fn(async () => {}),
  } as unknown as NotificationRepository;
  const service = new NotificationService(mailer, repo, {
    ownerEmail: "",
    siteUrl: "https://www.fotfstudios.cl",
    tz: "America/Santiago",
    address: "Los Chercanes 78a",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a",
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
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a",
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
      // Futuro: una sesión ya terminada se marca sin mandar (ver bloque claim-first).
      startsAt: "2999-09-08T23:00:00Z",
      endsAt: "2999-09-09T01:00:00Z",
    });

    expect(await service.notifyOrder("o-booking")).toBe(true);
    expect(mailer.send).toHaveBeenCalled();
  });
});

/**
 * Claim-first (auditoría 2026-09-14, H4). Antes: cliente → dueño → marcar. Si el
 * segundo envío o el update fallaban, notified_at quedaba en null y el cron diario
 * volvía a mandar la confirmación al cliente cada día. Ahora se reclama ANTES de
 * mandar (como AccessCodeService) y solo se suelta si falla el envío al cliente.
 */
describe("notifyOrder — reclama notified_at antes de mandar", () => {
  const order = {
    id: "o1",
    kind: "booking",
    email: "ana@e.cl",
    name: "Ana",
    amount: 9990,
    currency: "CLP",
    startsAt: "2999-01-01T18:00:00Z",
    endsAt: "2999-01-01T20:00:00Z",
    notifiedAt: null,
    lines: [{ description: "Sala · 1h", subtotal: 9990 }],
  };
  const withOwner = (svc: ReturnType<typeof makeService>) =>
    new NotificationService(svc.mailer, svc.repo, {
      ownerEmail: "owner@e.cl",
      siteUrl: "https://www.fotfstudios.cl",
      tz: "America/Santiago",
      address: "Los Chercanes 78a",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a",
      whatsappUrl: "https://wa.me/56962803298",
      termsUrl: "https://www.fotfstudios.cl/terminos",
      privacyUrl: "https://www.fotfstudios.cl/privacidad",
    });

  it("reclama antes del primer envío", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(order);
    const orden: string[] = [];
    vi.mocked(repo.markNotified).mockImplementation(async () => { orden.push("claim"); return true; });
    mailer.send.mockImplementation(async () => { orden.push("send"); });

    expect(await service.notifyOrder("o1")).toBe(true);
    expect(orden[0]).toBe("claim");
  });

  it("si otra corrida ya reclamó, no manda nada y devuelve false", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(order);
    vi.mocked(repo.markNotified).mockResolvedValue(false);

    expect(await service.notifyOrder("o1")).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("si falla el envío al cliente, suelta el reclamo y propaga (el cron reintenta)", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(order);
    mailer.send.mockRejectedValueOnce(new Error("resend 429"));

    await expect(service.notifyOrder("o1")).rejects.toThrow("resend 429");
    expect(repo.releaseNotified).toHaveBeenCalledWith("o1");
  });

  it("si falla el envío al dueño, el cliente NO recibe dos: la orden queda marcada y no se propaga", async () => {
    const base = makeService();
    const service = withOwner(base);
    vi.mocked(base.repo.getOrderForEmail).mockResolvedValue(order);
    base.mailer.send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("owner bounced"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await service.notifyOrder("o1")).toBe(true);
    expect(base.mailer.send).toHaveBeenCalledTimes(2);
    expect(base.repo.releaseNotified).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("sesión ya terminada: marca sin mandar (nada de confirmaciones tardías tras una caída)", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      ...order,
      startsAt: "2020-01-01T18:00:00Z",
      endsAt: "2020-01-01T20:00:00Z",
    });

    expect(await service.notifyOrder("o1")).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(repo.markNotified).toHaveBeenCalledWith("o1");
  });

  it("orden de delta de reagendamiento: marca sin mandar (no es una reserva)", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({ ...order, kind: "reschedule_delta", startsAt: null, endsAt: null });

    expect(await service.notifyOrder("o1")).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(repo.markNotified).toHaveBeenCalledWith("o1");
  });
});

describe("notifyPending — un fallo no frena a las demás", () => {
  it("cuenta enviadas y fallidas por separado", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.pendingPaidOrderIds).mockResolvedValue(["a", "b", "c"]);
    vi.mocked(repo.getOrderForEmail).mockImplementation(async (id) => ({
      id,
      kind: "booking",
      email: `${id}@e.cl`,
      name: null,
      amount: 9990,
      currency: "CLP",
      startsAt: "2999-01-01T18:00:00Z",
      endsAt: "2999-01-01T20:00:00Z",
      notifiedAt: null,
      lines: [],
    }));
    mailer.send.mockImplementation(async (m) => { if (m.to === "b@e.cl") throw new Error("boom"); });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await service.notifyPending()).toEqual({ notified: 2, failed: 1 });
    expect(mailer.send).toHaveBeenCalledTimes(3);
    err.mockRestore();
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

describe("notifyCancellation — orden 100% puntos", () => {
  it("con restoredPoints el email habla de puntos repuestos, no de reembolso en dinero", async () => {
    const { service, mailer, repo } = makeService();
    (repo.getOrderForEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "ana@e.cl",
      name: "Ana",
      startsAt: "2026-07-12T18:00:00Z",
    });
    const sent = await service.notifyCancellation("o1", { refundAmount: null, restoredPoints: 14990 });
    expect(sent).toBe(true);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.html).toContain("14.990 puntos");
    expect(msg.html).not.toMatch(/tarjeta|reembolsamos/);
  });
});

describe("notifyCourseRefunded — inscripción pagada cancelada", () => {
  const students = [
    { name: "Ana", email: "ana@e.cl" },
    { name: "Beto", email: "beto@e.cl" },
  ];

  it("manda un correo por alumno con el monto devuelto en CLP", async () => {
    const { service, mailer } = makeService();
    await service.notifyCourseRefunded({ students, generation: "G3", refundedClp: 149990 });
    expect(mailer.send).toHaveBeenCalledTimes(2);
    const tos = mailer.send.mock.calls.map((c) => c[0].to);
    expect(tos).toEqual(["ana@e.cl", "beto@e.cl"]);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.html).toContain("$149.990");
    expect(msg.html).toContain("G3");
  });

  it("sin reembolso: nunca dice que no hubo cobro", async () => {
    const { service, mailer } = makeService();
    await service.notifyCourseRefunded({ students: [students[0]], generation: "G3", refundedClp: null });
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.html).not.toMatch(/ningún cobro|reembolsamos/);
  });
});

describe("un solo formato de horario en todos los correos (H7)", () => {
  it("la confirmación de reserva lleva el rango de horas", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o1",
      kind: "booking",
      email: "ana@e.cl",
      name: "Ana",
      amount: 9990,
      currency: "CLP",
      startsAt: "2999-07-12T18:00:00Z",
      endsAt: "2999-07-12T20:00:00Z",
      notifiedAt: null,
      lines: [],
    });
    await service.notifyOrder("o1");
    expect(mailer.send.mock.calls[0][0].html).toContain("14:00–16:00 h");
  });

  it("notifyCoursePaid recibe las sesiones en ISO y las formatea él mismo (mismo formato desde admin y webhook)", async () => {
    const { service, mailer } = makeService();
    await service.notifyCoursePaid({
      students: [{ name: "Ana", email: "ana@e.cl" }],
      generation: "G3",
      totalClp: 149990,
      method: "efectivo",
      sessions: [{ startsAt: "2026-10-05T22:00:00Z", endsAt: "2026-10-06T00:00:00Z" }],
      seatsLeft: 3,
    });
    const html = mailer.send.mock.calls[0][0].html;
    expect(html).toContain("lunes 5 de octubre, 19:00–21:00 h");
    expect(html).not.toContain("lun 5 oct");
  });
});

describe("notifyOrder — la confirmación lleva la reserva al bolsillo (H8)", () => {
  const order = {
    id: "o-links",
    kind: "booking",
    email: "ana@e.cl",
    name: "Ana",
    amount: 9990,
    currency: "CLP",
    startsAt: "2999-07-12T18:00:00Z",
    endsAt: "2999-07-12T20:00:00Z",
    notifiedAt: null,
    lines: [{ description: "Sala · 2h", subtotal: 9990 }],
  };

  it("enlaza a /reserva/estado?b=<orden>, a Google Calendar y a /cuenta", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(order);
    await service.notifyOrder("o-links");
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.html).toContain("https://www.fotfstudios.cl/reserva/estado?b=o-links");
    expect(msg.html).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(msg.html).toContain("https://www.fotfstudios.cl/cuenta");
  });

  it("adjunta el .ics de la sesión (Apple Mail / Gmail lo ofrecen como evento)", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(order);
    await service.notifyOrder("o-links");
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].filename).toBe("reserva-fotf.ics");
    expect(msg.attachments![0].content).toContain("BEGIN:VCALENDAR");
    expect(msg.attachments![0].content).toContain("DTSTART:29990712T180000Z");
    expect(msg.attachments![0].content).toContain("Los Chercanes 78a");
  });

  it("el aviso al dueño no lleva adjunto", async () => {
    const base = makeService();
    const service = new NotificationService(base.mailer, base.repo, {
      ownerEmail: "owner@e.cl",
      siteUrl: "https://www.fotfstudios.cl",
      tz: "America/Santiago",
      address: "Los Chercanes 78a",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a",
      whatsappUrl: "https://wa.me/56962803298",
      termsUrl: "https://www.fotfstudios.cl/terminos",
      privacyUrl: "https://www.fotfstudios.cl/privacidad",
    });
    vi.mocked(base.repo.getOrderForEmail).mockResolvedValue(order);
    await service.notifyOrder("o-links");
    expect(base.mailer.send.mock.calls[1][0].to).toBe("owner@e.cl");
    expect(base.mailer.send.mock.calls[1][0].attachments).toBeUndefined();
  });
});

describe("notifyReminder (H9)", () => {
  it("manda el recordatorio con el horario en zona Santiago con rango y el link a la reserva", async () => {
    const { service, mailer } = makeService();
    expect(
      await service.notifyReminder({
        email: "ana@e.cl",
        name: "Ana",
        orderId: "o1",
        startsAt: "2026-07-12T18:00:00Z",
        endsAt: "2026-07-12T20:00:00Z",
      }),
    ).toBe(true);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.to).toBe("ana@e.cl");
    expect(msg.html).toContain("domingo 12 de julio, 14:00–16:00 h");
    expect(msg.html).toContain("https://www.fotfstudios.cl/reserva/estado?b=o1");
  });

  it("sin orden (cortesía) enlaza a la cuenta en vez del recibo", async () => {
    const { service, mailer } = makeService();
    await service.notifyReminder({ email: "ana@e.cl", name: null, orderId: null, startsAt: "2026-07-12T18:00:00Z", endsAt: "2026-07-12T20:00:00Z" });
    expect(mailer.send.mock.calls[0][0].html).toContain("https://www.fotfstudios.cl/cuenta");
  });
});

describe("estados que antes eran silencio (H6)", () => {
  const order = {
    id: "o1",
    kind: "booking",
    email: "ana@e.cl",
    name: "Ana",
    amount: 9990,
    currency: "CLP",
    startsAt: "2999-07-12T18:00:00Z",
    endsAt: "2999-07-12T20:00:00Z",
    notifiedAt: "2999-01-01T00:00:00Z",
    lines: [],
  };
  const withOwner = (svc: ReturnType<typeof makeService>) =>
    new NotificationService(svc.mailer, svc.repo, {
      ownerEmail: "owner@e.cl",
      siteUrl: "https://www.fotfstudios.cl",
      tz: "America/Santiago",
      address: "Los Chercanes 78a",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a",
      whatsappUrl: "https://wa.me/56962803298",
      termsUrl: "https://www.fotfstudios.cl/terminos",
      privacyUrl: "https://www.fotfstudios.cl/privacidad",
    });

  it("pago sin cupo: avisa al dueño PRIMERO y luego al cliente", async () => {
    const base = makeService();
    vi.mocked(base.repo.getOrderForEmail).mockResolvedValue(order);
    await withOwner(base).notifyPaymentNeedsReview("o1", "pay1");
    const tos = base.mailer.send.mock.calls.map((c) => c[0].to);
    expect(tos).toEqual(["owner@e.cl", "ana@e.cl"]);
    expect(base.mailer.send.mock.calls[1][0].html).toMatch(/ya no estaba disponible/);
  });

  it("pago sin cupo: si falla el correo al dueño, el cliente igual recibe el suyo", async () => {
    const base = makeService();
    vi.mocked(base.repo.getOrderForEmail).mockResolvedValue(order);
    base.mailer.send.mockRejectedValueOnce(new Error("owner bounced"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await withOwner(base).notifyPaymentNeedsReview("o1", "pay1");
    expect(base.mailer.send).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("hora liberada: manda al cliente de la orden con el horario", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue(order);
    expect(await service.notifyHoldExpired("o1")).toBe(true);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.to).toBe("ana@e.cl");
    expect(msg.html).toContain("14:00–16:00 h");
    expect(msg.html).toContain("https://www.fotfstudios.cl/reservar");
  });

  it("cortesía cancelada: datos en mano, sin email no manda", async () => {
    const { service, mailer } = makeService();
    expect(await service.notifyCourtesyCancelled({ email: null, name: "Ana", startsAt: "2999-07-12T18:00:00Z", endsAt: "2999-07-12T20:00:00Z" })).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(await service.notifyCourtesyCancelled({ email: "ana@e.cl", name: "Ana", startsAt: "2999-07-12T18:00:00Z", endsAt: "2999-07-12T20:00:00Z" })).toBe(true);
    expect(mailer.send.mock.calls[0][0].html).toContain("14:00–16:00 h");
  });
});

describe("calendario también en cortesía y reagendamiento", () => {
  it("notifyCourtesy adjunta el .ics con uid por RESERVA y enlaza al calendario y a la cuenta", async () => {
    const { service, mailer } = makeService();
    await service.notifyCourtesy({
      email: "ana@e.cl",
      name: "Ana",
      reservationId: "77",
      startsAt: "2999-07-12T18:00:00Z",
      endsAt: "2999-07-12T20:00:00Z",
      addonNames: [],
    });
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.attachments?.[0]?.filename).toBe("reserva-fotf.ics");
    expect(msg.attachments?.[0]?.content).toContain("UID:fotf-r-77@fotfstudios.cl");
    expect(msg.html).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(msg.html).toContain("https://www.fotfstudios.cl/cuenta");
  });

  it("notifyReschedule adjunta el .ics con el MISMO uid que la confirmación (el calendario actualiza el evento)", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o9",
      kind: "booking",
      email: "ana@e.cl",
      name: "Ana",
      amount: 9990,
      currency: "CLP",
      startsAt: "2999-07-13T18:00:00Z",
      endsAt: "2999-07-13T20:00:00Z",
      notifiedAt: "2999-01-01T00:00:00Z",
      lines: [],
    });
    await service.notifyReschedule("o9", { refundAmount: 0 });
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.attachments?.[0]?.content).toContain("UID:fotf-o9@fotfstudios.cl");
    expect(msg.attachments?.[0]?.content).toContain("DTSTART:29990713T180000Z");
    expect(msg.html).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
  });
});

describe("notifyRescheduleFailed — cobro de reagendamiento devuelto sin aplicarse (FR2)", () => {
  it("kept:true (el caso típico, slot tomado): mantiene el copy de 'se mantiene tu reserva'", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o1",
      kind: "booking",
      email: "c@e.cl",
      name: "Cata",
      amount: 29980,
      currency: "CLP",
      startsAt: "2026-09-16T19:00:00Z",
      endsAt: "2026-09-16T21:00:00Z",
      notifiedAt: null,
      lines: [],
    });
    expect(await service.notifyRescheduleFailed("o1", { refundAmount: 6000, kept: true })).toBe(true);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.subject).toMatch(/No pudimos cambiar tu horario · se mantiene/);
    expect(msg.html).toContain("Mantuvimos tu reserva original del");
    expect(msg.html).toContain("$6.000");
  });

  it("kept:false (la reserva ya estaba cancelada): copy de devolución, sin decir que se mantiene nada", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o1",
      kind: "booking",
      email: "c@e.cl",
      name: "Cata",
      amount: 29980,
      currency: "CLP",
      startsAt: "2026-09-16T19:00:00Z",
      endsAt: "2026-09-16T21:00:00Z",
      notifiedAt: null,
      lines: [],
    });
    expect(await service.notifyRescheduleFailed("o1", { refundAmount: 6000, kept: false })).toBe(true);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.subject).toMatch(/Te devolvimos \$6\.000 · cambio de horario/);
    expect(msg.html).not.toContain("Mantuvimos tu reserva");
    expect(msg.html).toContain("ya estaba cancelada");
    expect(msg.html).toContain("$6.000");
  });

  it("sin email en la orden no manda nada y devuelve false", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o1",
      kind: "booking",
      email: null,
      name: "Cata",
      amount: 29980,
      currency: "CLP",
      startsAt: "2026-09-16T19:00:00Z",
      endsAt: "2026-09-16T21:00:00Z",
      notifiedAt: null,
      lines: [],
    });
    expect(await service.notifyRescheduleFailed("o1", { refundAmount: 6000, kept: true })).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe("notifyReschedulePaymentLink — cobro de reagendamiento pendiente (H4)", () => {
  it("notifyReschedulePaymentLink: asunto con el horario NUEVO, monto y link; sin .ics", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o1",
      kind: "booking",
      email: "c@e.cl",
      name: "Cata",
      amount: 29980,
      currency: "CLP",
      startsAt: "2026-09-16T19:00:00Z",
      endsAt: "2026-09-16T21:00:00Z",
      notifiedAt: null,
      lines: [],
    });
    expect(
      await service.notifyReschedulePaymentLink("o1", {
        newStartsAt: "2026-09-19T18:00:00Z",
        newEndsAt: "2026-09-19T20:00:00Z",
        amount: 6000,
        initPoint: "https://mp/x",
        expiresInHours: 24,
      }),
    ).toBe(true);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.subject).toMatch(/Confirma tu nuevo horario · sábado 19 de septiembre, 15:00–17:00 h/);
    expect(msg.html).toContain("$6.000");
    expect(msg.html).toContain("https://mp/x");
    expect(msg.html).toContain("miércoles 16 de septiembre, 16:00–18:00 h");
    expect(msg.attachments).toBeUndefined();
  });

  it("sin email en la orden no manda nada y devuelve false", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o1",
      kind: "booking",
      email: null,
      name: "Cata",
      amount: 29980,
      currency: "CLP",
      startsAt: "2026-09-16T19:00:00Z",
      endsAt: "2026-09-16T21:00:00Z",
      notifiedAt: null,
      lines: [],
    });
    expect(
      await service.notifyReschedulePaymentLink("o1", {
        newStartsAt: "2026-09-19T18:00:00Z",
        newEndsAt: "2026-09-19T20:00:00Z",
        amount: 6000,
        initPoint: "https://mp/x",
        expiresInHours: 24,
      }),
    ).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe("notifyCourtesyRescheduled (H6) + copy offline al reembolsar (M2)", () => {
  it("notifyCourtesyRescheduled: datos en mano, asunto con el horario nuevo, .ics con el uid de la reserva", async () => {
    const { service, mailer, repo } = makeService();
    expect(
      await service.notifyCourtesyRescheduled({
        email: "v@e.cl",
        name: "Vale",
        reservationId: "r1",
        oldStartsAt: "2026-09-17T15:00:00Z",
        startsAt: "2026-09-17T11:00:00Z",
        endsAt: "2026-09-17T12:00:00Z",
      }),
    ).toBe(true);
    expect(repo.getOrderForEmail).not.toHaveBeenCalled();
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.subject).toMatch(/Sesión reagendada · jueves 17 de septiembre, 08:00–09:00 h/);
    expect(msg.attachments?.[0]?.filename).toBe("reserva-fotf.ics");
    expect(msg.attachments?.[0]?.content).toContain("UID:fotf-r-r1@fotfstudios.cl");
  });

  it("notifyCourtesyRescheduled sin email → false, no manda", async () => {
    const { service, mailer } = makeService();
    expect(
      await service.notifyCourtesyRescheduled({
        email: null,
        name: "Vale",
        reservationId: "r1",
        oldStartsAt: "2026-09-17T15:00:00Z",
        startsAt: "2026-09-17T11:00:00Z",
        endsAt: "2026-09-17T12:00:00Z",
      }),
    ).toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("notifyReschedule offline: la línea del reembolso dice que el estudio coordina la devolución", async () => {
    const { service, mailer, repo } = makeService();
    vi.mocked(repo.getOrderForEmail).mockResolvedValue({
      id: "o1",
      kind: "booking",
      email: "c@e.cl",
      name: "Cata",
      amount: 29980,
      currency: "CLP",
      startsAt: "2026-09-16T19:00:00Z",
      endsAt: "2026-09-16T21:00:00Z",
      notifiedAt: null,
      lines: [],
    });
    await service.notifyReschedule("o1", { refundAmount: 5000, offline: true });
    expect(mailer.send.mock.calls[0][0].html).toContain("coordinamos contigo la devolución de <strong");
    expect(mailer.send.mock.calls[0][0].html).not.toContain("medio de pago original");
  });
});
