import { describe, expect, it, vi } from "vitest";
import { PaymentReminderService, type PaymentReminderRepository } from "./payment-reminder-service";

type Due = Awaited<ReturnType<PaymentReminderRepository["due"]>>[number];
// Reloj lun 5 oct 14:00 UTC → barrido del vie 9 oct 12:30 UTC; sesión lejos (20 oct).
const due = (over: Partial<Due> = {}): Due => ({
  orderId: "o1",
  clockStart: "2026-10-05T14:00:00Z",
  startsAt: "2026-10-20T21:00:00Z",
  customerEmail: "ana@e.cl",
  ...over,
});

const IN_WINDOW = new Date("2026-10-08T13:00:00Z"); // 23,5 h antes del barrido

const make = (rows: Due[]) => {
  const repo: PaymentReminderRepository = {
    due: vi.fn(async () => rows),
    markSent: vi.fn(async () => true),
    releaseSent: vi.fn(async () => {}),
  };
  const notifications = { notifyPaymentReminder: vi.fn(async () => true) };
  return { repo, notifications, service: new PaymentReminderService(repo, notifications) };
};

describe("PaymentReminderService.sweep — cuándo toca", () => {
  it("manda cuando quedan ≤ 24 h para el barrido, con el reloj del pedido", async () => {
    const { service, notifications } = make([due(), due({ orderId: "o2", customerEmail: "b@e.cl" })]);
    expect(await service.sweep(IN_WINDOW)).toEqual({ sent: 2, skippedNoEmail: 0 });
    expect(notifications.notifyPaymentReminder).toHaveBeenCalledWith("o1", { clockStart: "2026-10-05T14:00:00Z", now: IN_WINDOW });
  });

  it("no manda si al barrido le quedan más de 24 h (aunque el reloj tenga ≥ 48 h)", async () => {
    const { service, repo } = make([due()]);
    // reloj + 48 h = mié 7 14:00 UTC; el barrido real es el vie 9 → faltan ~46 h
    expect(await service.sweep(new Date("2026-10-07T14:30:00Z"))).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it("la sesión antes del barrido manda: recuerda a ≤ 24 h del INICIO", async () => {
    const starts = "2026-10-06T21:00:00Z"; // mar 18:00 CL, antes del barrido del vie
    const { service, notifications } = make([due({ startsAt: starts })]);
    expect(await service.sweep(new Date("2026-10-05T20:00:00Z"))).toEqual({ sent: 0, skippedNoEmail: 0 }); // faltan 25 h
    expect(await service.sweep(new Date("2026-10-06T09:00:00Z"))).toEqual({ sent: 1, skippedNoEmail: 0 }); // faltan 12 h
    expect(notifications.notifyPaymentReminder).toHaveBeenCalledTimes(1);
  });

  it("pasado el plazo ya no manda", async () => {
    const { service, repo } = make([due({ startsAt: "2026-10-06T21:00:00Z" })]);
    expect(await service.sweep(new Date("2026-10-06T21:01:00Z"))).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(repo.markSent).not.toHaveBeenCalled();
  });
});

describe("PaymentReminderService.sweep — reclamo", () => {
  it("reclama ANTES de mandar y no manda si otra corrida ganó", async () => {
    const { service, repo, notifications } = make([due()]);
    const orden: string[] = [];
    vi.mocked(repo.markSent).mockImplementation(async () => { orden.push("claim"); return false; });
    vi.mocked(notifications.notifyPaymentReminder).mockImplementation(async () => { orden.push("send"); return true; });
    expect(await service.sweep(IN_WINDOW)).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(orden).toEqual(["claim"]);
  });

  it("si el correo falla, suelta el reclamo (la próxima corrida reintenta) y no cuenta", async () => {
    const { service, repo, notifications } = make([due()]);
    vi.mocked(notifications.notifyPaymentReminder).mockRejectedValue(new Error("resend down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.sweep(IN_WINDOW)).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(repo.releaseSent).toHaveBeenCalledWith("o1");
    err.mockRestore();
  });

  it("si el servicio no encontró a quién mandar (false), suelta y no cuenta", async () => {
    const { service, repo, notifications } = make([due()]);
    vi.mocked(notifications.notifyPaymentReminder).mockResolvedValue(false);
    expect(await service.sweep(IN_WINDOW)).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(repo.releaseSent).toHaveBeenCalledWith("o1");
  });

  it("debida sin email no reclama ni manda: la cuenta aparte", async () => {
    const { service, repo, notifications } = make([due({ customerEmail: null })]);
    expect(await service.sweep(IN_WINDOW)).toEqual({ sent: 0, skippedNoEmail: 1 });
    expect(repo.markSent).not.toHaveBeenCalled();
    expect(notifications.notifyPaymentReminder).not.toHaveBeenCalled();
  });

  it("un fallo en un pedido no frena a los demás", async () => {
    const { service, notifications } = make([due(), due({ orderId: "o2" })]);
    vi.mocked(notifications.notifyPaymentReminder).mockRejectedValueOnce(new Error("x"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.sweep(IN_WINDOW)).toEqual({ sent: 1, skippedNoEmail: 0 });
    err.mockRestore();
  });
});
