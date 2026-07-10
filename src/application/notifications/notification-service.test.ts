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
