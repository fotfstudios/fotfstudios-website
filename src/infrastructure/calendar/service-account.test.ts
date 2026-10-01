import { describe, expect, it } from "vitest";
import { parseServiceAccount } from "./service-account";

const SA = { type: "service_account", client_email: "espejo@p.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n" };

describe("parseServiceAccount", () => {
  it("lee el JSON tal cual lo descarga Google", () => {
    expect(parseServiceAccount(JSON.stringify(SA))).toEqual({ ok: true, clientEmail: SA.client_email, privateKey: SA.private_key });
  });

  it("lee el JSON en base64 (lo recomendado en Vercel: sin comillas ni saltos que romper)", () => {
    const b64 = Buffer.from(JSON.stringify(SA)).toString("base64");
    expect(parseServiceAccount(b64)).toMatchObject({ ok: true, clientEmail: SA.client_email });
  });

  it("tolera espacios alrededor", () => {
    expect(parseServiceAccount(`  ${JSON.stringify(SA)}\n`)).toMatchObject({ ok: true });
  });

  it("vacío o ausente = no configurado (sin error: la función es opcional)", () => {
    expect(parseServiceAccount(undefined)).toEqual({ ok: false, error: null });
    expect(parseServiceAccount("")).toEqual({ ok: false, error: null });
  });

  it("basura o un JSON sin las claves → error claro para mostrar en el admin", () => {
    expect(parseServiceAccount("no-es-json")).toMatchObject({ ok: false, error: expect.stringContaining("GOOGLE_SERVICE_ACCOUNT_JSON") });
    expect(parseServiceAccount(JSON.stringify({ client_email: "x" }))).toMatchObject({ ok: false, error: expect.stringContaining("private_key") });
  });
});
