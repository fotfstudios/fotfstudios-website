import { describe, expect, it, vi } from "vitest";
import type { NotificationLogRepository } from "@/src/application/ports/notification-log";
import { WhatsAppSendError, type WhatsAppSender, type WhatsAppTemplate } from "@/src/application/ports/whatsapp";
import { LoggedWhatsAppSender } from "./logged-sender";

const tpl: WhatsAppTemplate = { name: "fotf_pin_acceso", language: "es", params: { nombre: "Ana", hora: "18:00", pin: "482913" } };

const make = (inner: WhatsAppSender, record = vi.fn(async () => {})) => {
  const log = { record, recentFailures: vi.fn() } as unknown as NotificationLogRepository;
  return { sender: new LoggedWhatsAppSender(inner, log), log };
};

describe("LoggedWhatsAppSender", () => {
  it("registra el envío aceptado con canal whatsapp y devuelve el wamid", async () => {
    const { sender, log } = make({ sendTemplate: vi.fn(async () => ({ providerId: "wamid.1" })) });
    expect(await sender.sendTemplate("56912345678", tpl)).toEqual({ providerId: "wamid.1" });
    expect(log.record).toHaveBeenCalledWith({
      template: "fotf_pin_acceso",
      recipient: "56912345678",
      subject: "WhatsApp · fotf_pin_acceso",
      channel: "whatsapp",
      ok: true,
      error: null,
    });
  });

  it("un fallo del proveedor se registra con su mensaje y se propaga intacto (la cola lee retryable)", async () => {
    const err = new WhatsAppSendError("HTTP 400: template does not exist", 132001, false);
    const { sender, log } = make({ sendTemplate: vi.fn(async () => { throw err; }) });
    await expect(sender.sendTemplate("56912345678", tpl)).rejects.toBe(err);
    expect(log.record).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: "HTTP 400: template does not exist", channel: "whatsapp" }));
  });

  it("un fallo de la bitácora no tapa un envío exitoso", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sender } = make({ sendTemplate: vi.fn(async () => ({ providerId: "wamid.1" })) }, vi.fn(async () => { throw new Error("db down"); }));
    expect(await sender.sendTemplate("56912345678", tpl)).toEqual({ providerId: "wamid.1" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
