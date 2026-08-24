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
