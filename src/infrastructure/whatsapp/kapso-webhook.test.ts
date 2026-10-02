import { describe, expect, it } from "vitest";
import { parseKapsoStatusEvent } from "./kapso-webhook";

const body = (kapso: Record<string, unknown>, id: unknown = "wamid.1") => ({ message: { id, to: "56912345678", kapso }, phone_number_id: "123" });

describe("parseKapsoStatusEvent", () => {
  it.each([
    ["whatsapp.message.sent", "sent"],
    ["whatsapp.message.delivered", "delivered"],
    ["whatsapp.message.read", "read"],
  ])("%s → %s", (event, status) => {
    expect(parseKapsoStatusEvent(event, body({ direction: "outbound", status }))).toEqual({ providerId: "wamid.1", status, code: null, message: null });
  });

  it("failed trae el código y el texto del último estado con errores", () => {
    const b = body({
      direction: "outbound",
      status: "failed",
      statuses: [
        { status: "sent", errors: [] },
        { status: "failed", errors: [{ code: 131026, title: "Message undeliverable", message: "Message undeliverable" }] },
      ],
    });
    expect(parseKapsoStatusEvent("whatsapp.message.failed", b)).toEqual({
      providerId: "wamid.1",
      status: "failed",
      code: 131026,
      message: "Message undeliverable",
    });
  });

  it("failed sin errores igual se aplica, sin código", () => {
    expect(parseKapsoStatusEvent("whatsapp.message.failed", body({ direction: "outbound" }))).toMatchObject({ status: "failed", code: null });
  });

  it("ignora otros eventos, mensajes entrantes y cuerpos sin wamid", () => {
    expect(parseKapsoStatusEvent("whatsapp.message.received", body({ direction: "inbound" }))).toBeNull();
    expect(parseKapsoStatusEvent("whatsapp.conversation.created", {})).toBeNull();
    expect(parseKapsoStatusEvent("whatsapp.message.delivered", body({ direction: "inbound" }))).toBeNull();
    expect(parseKapsoStatusEvent("whatsapp.message.delivered", body({}, ""))).toBeNull();
    expect(parseKapsoStatusEvent("whatsapp.message.delivered", null)).toBeNull();
    expect(parseKapsoStatusEvent(null, body({}))).toBeNull();
  });
});
