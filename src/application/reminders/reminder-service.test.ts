import { describe, expect, it, vi } from "vitest";
import { ReminderService, type ReminderRepository } from "./reminder-service";

const due = (over: Partial<ReminderDue> = {}): ReminderDue => ({
  id: "r1",
  orderId: "o1",
  startsAt: "2026-09-15T18:00:00Z",
  endsAt: "2026-09-15T20:00:00Z",
  customerName: "Ana",
  customerEmail: "ana@e.cl",
  ...over,
});
type ReminderDue = Awaited<ReturnType<ReminderRepository["remindersDue"]>>[number];

const make = (rows: ReminderDue[]) => {
  const repo: ReminderRepository = {
    remindersDue: vi.fn(async () => rows),
    markReminderSent: vi.fn(async () => true),
    releaseReminderSent: vi.fn(async () => {}),
  };
  const notifications = { notifyReminder: vi.fn(async () => true) };
  return { repo, notifications, service: new ReminderService(repo, notifications) };
};

describe("ReminderService.sweep — recordatorio 24 h antes", () => {
  it("manda un recordatorio por reserva debida, con sus datos", async () => {
    const { service, notifications } = make([due(), due({ id: "r2", orderId: "o2", customerEmail: "b@e.cl" })]);
    expect(await service.sweep()).toEqual({ sent: 2, skippedNoEmail: 0 });
    expect(notifications.notifyReminder).toHaveBeenCalledWith({
      email: "ana@e.cl",
      name: "Ana",
      orderId: "o1",
      startsAt: "2026-09-15T18:00:00Z",
      endsAt: "2026-09-15T20:00:00Z",
    });
  });

  it("reclama ANTES de mandar y no manda si otra corrida ganó", async () => {
    const { service, repo, notifications } = make([due()]);
    const orden: string[] = [];
    vi.mocked(repo.markReminderSent).mockImplementation(async () => { orden.push("claim"); return false; });
    vi.mocked(notifications.notifyReminder).mockImplementation(async () => { orden.push("send"); return true; });
    expect(await service.sweep()).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(orden).toEqual(["claim"]);
  });

  it("si el correo falla, suelta el reclamo (la próxima corrida reintenta) y no cuenta", async () => {
    const { service, repo, notifications } = make([due()]);
    vi.mocked(notifications.notifyReminder).mockRejectedValue(new Error("resend down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await service.sweep()).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(repo.releaseReminderSent).toHaveBeenCalledWith("r1");
    err.mockRestore();
  });

  it("sin email no reclama ni manda: lo cuenta aparte", async () => {
    const { service, repo, notifications } = make([due({ customerEmail: null })]);
    expect(await service.sweep()).toEqual({ sent: 0, skippedNoEmail: 1 });
    expect(repo.markReminderSent).not.toHaveBeenCalled();
    expect(notifications.notifyReminder).not.toHaveBeenCalled();
  });
});
