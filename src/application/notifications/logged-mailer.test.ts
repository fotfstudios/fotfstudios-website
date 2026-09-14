import { describe, expect, it, vi } from "vitest";
import type { EmailMessage, Mailer } from "@/src/application/ports/mailer";
import type { NotificationLogRepository } from "@/src/application/ports/notification-log";
import { LoggedMailer } from "./logged-mailer";

const msg: EmailMessage = {
  to: "ana@e.cl",
  template: "customerConfirmation",
  subject: "Tu reserva en FOTF Studios está confirmada",
  html: "<p>hola</p>",
  text: "hola",
};

const make = (inner: Mailer) => {
  const log = { record: vi.fn(async () => {}), recentFailures: vi.fn() } as unknown as NotificationLogRepository;
  return { mailer: new LoggedMailer(inner, log), log };
};

describe("LoggedMailer", () => {
  it("registra el envío exitoso con plantilla, destinatario y asunto", async () => {
    const { mailer, log } = make({ send: vi.fn(async () => {}) });
    await mailer.send(msg);
    expect(log.record).toHaveBeenCalledWith({
      template: "customerConfirmation",
      recipient: "ana@e.cl",
      subject: msg.subject,
      ok: true,
      error: null,
    });
  });

  it("registra el fallo con el mensaje del proveedor y lo propaga", async () => {
    const { mailer, log } = make({ send: vi.fn(async () => { throw new Error("API key is invalid"); }) });
    await expect(mailer.send(msg)).rejects.toThrow("API key is invalid");
    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: "API key is invalid" }));
  });

  it("si la bitácora falla, el envío igual se considera hecho (no tapa al mailer)", async () => {
    const inner = { send: vi.fn(async () => {}) };
    const log = { record: vi.fn(async () => { throw new Error("db down"); }), recentFailures: vi.fn() } as unknown as NotificationLogRepository;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new LoggedMailer(inner, log).send(msg)).resolves.toBeUndefined();
    expect(inner.send).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
