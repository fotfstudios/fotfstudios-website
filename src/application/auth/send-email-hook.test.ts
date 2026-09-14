import { Webhook } from "standardwebhooks";
import { describe, expect, it, vi } from "vitest";
import type { Mailer } from "@/src/application/ports/mailer";
import { SendEmailHookService } from "./send-email-hook";

const SECRET_B64 = Buffer.from("s".repeat(32)).toString("base64");
const SECRET = `v1,whsec_${SECRET_B64}`;
const payload = JSON.stringify({
  user: { id: "u1", email: "ana@e.cl" },
  email_data: {
    token: "12345678",
    token_hash: "h",
    redirect_to: "https://www.fotfstudios.cl/auth/callback",
    email_action_type: "magiclink",
    site_url: "https://www.fotfstudios.cl",
    token_new: "",
    token_hash_new: "",
  },
});

/** Firma como lo hace GoTrue (Standard Webhooks). */
function signed(body: string, secretB64 = SECRET_B64, at = new Date()): Record<string, string> {
  const id = "msg_1";
  return {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(at.getTime() / 1000)),
    "webhook-signature": new Webhook(secretB64).sign(id, at, body),
  };
}

const make = (secrets = SECRET, mailer: Mailer = { send: vi.fn(async () => {}) }) => ({
  mailer,
  service: new SendEmailHookService({ secrets, mailer, supabaseUrl: "https://abc.supabase.co" }),
});

describe("SendEmailHookService.handle", () => {
  it("firma válida: manda el correo y responde 200", async () => {
    const { service, mailer } = make();
    const res = await service.handle(payload, signed(payload));
    expect(res.status).toBe(200);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mailer.send).mock.calls[0][0].to).toBe("ana@e.cl");
  });

  it("firma inválida: 401 y no manda nada", async () => {
    const { service, mailer } = make();
    const res = await service.handle(payload, signed(payload, Buffer.from("x".repeat(32)).toString("base64")));
    expect(res.status).toBe(401);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("timestamp viejo (replay): 401", async () => {
    const { service } = make();
    const res = await service.handle(payload, signed(payload, SECRET_B64, new Date(Date.now() - 10 * 60_000)));
    expect(res.status).toBe(401);
  });

  it("rotación: acepta cualquiera de los secretos separados por |", async () => {
    const other = Buffer.from("o".repeat(32)).toString("base64");
    const { service, mailer } = make(`v1,whsec_${other}|${SECRET}`);
    expect((await service.handle(payload, signed(payload))).status).toBe(200);
    expect((await service.handle(payload, signed(payload, other))).status).toBe(200);
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });

  it("sin secreto configurado: 503 (fail-closed)", async () => {
    const { service, mailer } = make("");
    expect((await service.handle(payload, signed(payload))).status).toBe(503);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("si el proveedor falla: 500 con el formato de error del hook (Auth le dice al cliente que no salió)", async () => {
    const { service } = make(SECRET, { send: vi.fn(async () => { throw new Error("API key is invalid"); }) });
    const res = await service.handle(payload, signed(payload));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { http_code: 500, message: expect.stringContaining("API key is invalid") } });
  });

  it("tipo sin correo que mandar: 200 y nada enviado", async () => {
    const p = payload.replace('"magiclink"', '"password_changed_notification"').replace('"12345678"', '""');
    const { service, mailer } = make();
    expect((await service.handle(p, signed(p))).status).toBe(200);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
