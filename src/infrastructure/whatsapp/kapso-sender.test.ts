import { describe, expect, it, vi } from "vitest";
import { WhatsAppSendError, type WhatsAppTemplate } from "@/src/application/ports/whatsapp";
import { KAPSO_API_BASE, KapsoWhatsAppSender, NoopWhatsAppSender, kapsoTemplateBody } from "./kapso-sender";

const tpl: WhatsAppTemplate = {
  name: "fotf_reserva_confirmada",
  language: "es",
  params: { nombre: "Ana", fecha: "sábado 4 de octubre, 18:00–20:00", total: "$30.000" },
  buttonSuffix: "ord-1",
};

function sender(response: { status?: number; body?: unknown } | Error, opts: { onlyTo?: string | null } = {}) {
  const fetchImpl = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status ?? 200 });
  });
  return { fetchImpl, s: new KapsoWhatsAppSender({ apiKey: "k", phoneNumberId: "647015955153740", fetchImpl, ...opts }) };
}

async function failure(p: Promise<unknown>): Promise<WhatsAppSendError> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(WhatsAppSendError);
  return e as WhatsAppSendError;
}

describe("kapsoTemplateBody", () => {
  it("parámetros con nombre en el body y el sufijo en el botón 0", () => {
    expect(kapsoTemplateBody("56912345678", tpl)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "56912345678",
      type: "template",
      template: {
        name: "fotf_reserva_confirmada",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", parameter_name: "nombre", text: "Ana" },
              { type: "text", parameter_name: "fecha", text: "sábado 4 de octubre, 18:00–20:00" },
              { type: "text", parameter_name: "total", text: "$30.000" },
            ],
          },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "ord-1" }] },
        ],
      },
    });
  });

  it("sin botón ni parámetros no manda componentes vacíos", () => {
    expect(kapsoTemplateBody("1", { name: "x", language: "es", params: {} }).template.components).toEqual([]);
  });
});

describe("KapsoWhatsAppSender", () => {
  it("POST al endpoint del número con X-API-Key y devuelve el wamid", async () => {
    const { s, fetchImpl } = sender({ body: { messages: [{ id: "wamid.HBg", message_status: "accepted" }] } });
    expect(await s.sendTemplate("56912345678", tpl)).toEqual({ providerId: "wamid.HBg" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${KAPSO_API_BASE}/647015955153740/messages`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-API-Key": "k", "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(kapsoTemplateBody("56912345678", tpl));
  });

  it("plantilla inexistente (132001): terminal, con el código y el mensaje de Meta", async () => {
    const { s } = sender({ status: 400, body: { error: { message: "(#132001) Template name does not exist in the translation", code: 132001 } } });
    const e = await failure(s.sendTemplate("56912345678", tpl));
    expect(e).toMatchObject({ code: 132001, retryable: false });
    expect(e.message).toMatch(/HTTP 400.*132001/);
  });

  it("429 y 5xx: reintentables", async () => {
    expect(await failure(sender({ status: 429, body: { error: { message: "rate", code: 130429 } } }).s.sendTemplate("1", tpl))).toMatchObject({ retryable: true, code: 130429 });
    expect(await failure(sender({ status: 503, body: "<html>" }).s.sendTemplate("1", tpl))).toMatchObject({ retryable: true, code: 503 });
  });

  it("un 4xx con código transitorio de Meta (131048 anti-spam) también se reintenta", async () => {
    const e = await failure(sender({ status: 400, body: { error: { message: "Spam rate limit hit", code: 131048 } } }).s.sendTemplate("1", tpl));
    expect(e.retryable).toBe(true);
  });

  it("error de red o timeout: reintentable sin código", async () => {
    const e = await failure(sender(new TypeError("fetch failed")).s.sendTemplate("1", tpl));
    expect(e).toMatchObject({ code: null, retryable: true });
    expect(e.message).toMatch(/red: fetch failed/);
  });

  it("aceptado sin id: terminal (reintentar podría duplicar)", async () => {
    expect(await failure(sender({ body: { messages: [] } }).s.sendTemplate("1", tpl))).toMatchObject({ retryable: false });
  });

  it("guarda fuera de producción: solo deja pasar al dueño, sin llamar a Kapso", async () => {
    const { s, fetchImpl } = sender({ body: { messages: [{ id: "wamid.1" }] } }, { onlyTo: "56911112222" });
    expect(await failure(s.sendTemplate("56912345678", tpl))).toMatchObject({ retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await s.sendTemplate("56911112222", tpl)).toEqual({ providerId: "wamid.1" });
  });

  it("guarda sin dueño configurado (onlyTo null): no deja pasar a nadie", async () => {
    const { s, fetchImpl } = sender({ body: { messages: [{ id: "wamid.1" }] } }, { onlyTo: null });
    await failure(s.sendTemplate("56912345678", tpl));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("NoopWhatsAppSender", () => {
  it("no manda, loguea y devuelve un id noop", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { providerId } = await new NoopWhatsAppSender().sendTemplate("56912345678", tpl);
    expect(providerId).toMatch(/^noop\./);
    expect(log.mock.calls[0][0]).toMatch(/\[whatsapp:noop\] fotf_reserva_confirmada → 56912345678/);
    log.mockRestore();
  });
});
