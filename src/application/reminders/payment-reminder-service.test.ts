import { describe, expect, it, vi } from "vitest";
import { PaymentReminderService, type PaymentReminderRepository } from "./payment-reminder-service";

type Due = Awaited<ReturnType<PaymentReminderRepository["due"]>>[number];
const due = (over: Partial<Due> = {}): Due => ({
  orderId: "o1",
  clockStart: "2026-10-05T14:00:00Z",
  customerEmail: "ana@e.cl",
  ...over,
});

const NOW = new Date("2026-10-07T14:05:00Z"); // 48 h + 5 min después del reloj

const make = (rows: Due[]) => {
  const repo: PaymentReminderRepository = {
    due: vi.fn(async () => rows),
    markSent: vi.fn(async () => true),
    releaseSent: vi.fn(async () => {}),
  };
  const notifications = { notifyPaymentReminder: vi.fn(async () => true) };
  return { repo, notifications, service: new PaymentReminderService(repo, notifications) };
};

describe("PaymentReminderService.sweep — recordatorio de pago a ~24 h de liberar la hora", () => {
  it("manda uno por pedido debido, con la hora REAL de liberación (barrido diario)", async () => {
    const { service, notifications } = make([due(), due({ orderId: "o2", customerEmail: "b@e.cl" })]);
    expect(await service.sweep(NOW)).toEqual({ sent: 2, skippedNoEmail: 0 });
    // reloj lun 14:00 UTC + 72 h = jue 14:00 UTC → barrido del viernes 12:30 UTC
    expect(notifications.notifyPaymentReminder).toHaveBeenCalledWith("o1", { freesAt: "2026-10-09T12:30:00.000Z" });
    expect(notifications.notifyPaymentReminder).toHaveBeenCalledWith("o2", { freesAt: "2026-10-09T12:30:00.000Z" });
  });

  it("reclama ANTES de mandar y no manda si otra corrida ganó", async () => {
    const { service, repo, notifications } = make([due()]);
    const orden: string[] = [];
    vi.mocked(repo.markSent).mockImplementation(async () => { orden.push("claim"); return false; });
    vi.mocked(notifications.notifyPaymentReminder).mockImplementation(async () => { orden.push("send"); return true; });
    expect(await service.sweep(NOW)).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(orden).toEqual(["claim"]);
  });

  it("si el correo falla, suelta el reclamo (la próxima corrida reintenta) y no cuenta", async () => {
    const { service, repo, notifications } = make([due()]);
    vi.mocked(notifications.notifyPaymentReminder).mockRejectedValue(new Error("resend down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.sweep(NOW)).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(repo.releaseSent).toHaveBeenCalledWith("o1");
    err.mockRestore();
  });

  it("si el servicio no encontró a quién mandar (false), suelta y no cuenta", async () => {
    const { service, repo, notifications } = make([due()]);
    vi.mocked(notifications.notifyPaymentReminder).mockResolvedValue(false);
    expect(await service.sweep(NOW)).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(repo.releaseSent).toHaveBeenCalledWith("o1");
  });

  it("sin email no reclama ni manda: lo cuenta aparte", async () => {
    const { service, repo, notifications } = make([due({ customerEmail: null })]);
    expect(await service.sweep(NOW)).toEqual({ sent: 0, skippedNoEmail: 1 });
    expect(repo.markSent).not.toHaveBeenCalled();
    expect(notifications.notifyPaymentReminder).not.toHaveBeenCalled();
  });

  it("un fallo en un pedido no frena a los demás", async () => {
    const { service, notifications } = make([due(), due({ orderId: "o2" })]);
    vi.mocked(notifications.notifyPaymentReminder).mockRejectedValueOnce(new Error("x"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.sweep(NOW)).toEqual({ sent: 1, skippedNoEmail: 0 });
    err.mockRestore();
  });
});
