/**
 * POST /api/webhooks/mercadopago — tope por IP de las notificaciones SIN firma (auditoría
 * 2026-10-12): cada una dispara un GET /v1/payments con nuestro token. Las firmadas nunca
 * pasan por el limitador. Se mockean las costuras (firma, servicio, composición).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signatureFailure: null as string | null,
  allowed: true,
  hit: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("@/src/infrastructure/payments/mercadopago/verify-signature", () => ({
  mpSignatureFailure: () => state.signatureFailure,
}));
vi.mock("@/src/infrastructure/db/supabase-client", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/src/application/payment/webhook-service", () => ({
  WebhookService: class {
    handlePaymentNotification = state.handle;
  },
}));
vi.mock("@/src/composition", () => ({
  rateLimiter: () => ({ hit: state.hit }),
  notificationService: () => ({}),
  rescheduleNotifyInfo: async () => null,
}));

import { POST } from "@/app/api/webhooks/mercadopago/route";

const notify = () =>
  POST(
    new Request("http://localhost/api/webhooks/mercadopago?data.id=123&type=payment", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9" },
      body: JSON.stringify({ type: "payment", data: { id: "123" } }),
    }),
  );

beforeEach(() => {
  // La ruta solo exige que existan; el gateway y la DB están mockeados.
  vi.stubEnv("MP_ACCESS_TOKEN", "test-token");
  vi.stubEnv("SUPABASE_URL", "http://localhost:54421");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  state.signatureFailure = null;
  state.allowed = true;
  state.hit.mockReset();
  state.hit.mockImplementation(async () => state.allowed);
  state.handle.mockReset();
  state.handle.mockResolvedValue({ result: "pending", orderId: null });
});

describe("POST /api/webhooks/mercadopago — tope de notificaciones sin firma", () => {
  it("sin firma y sobre el tope: 200 sin consultar a MP", async () => {
    state.signatureFailure = "missing";
    state.allowed = false;
    const res = await notify();
    expect(res.status).toBe(200);
    expect(state.handle).not.toHaveBeenCalled();
  });

  it("sin firma bajo el tope: se procesa vía la API de MP, como siempre", async () => {
    state.signatureFailure = "missing";
    await notify();
    expect(state.hit).toHaveBeenCalledTimes(1);
    expect(state.handle).toHaveBeenCalledWith("123");
  });

  it("con firma válida: nunca pasa por el limitador", async () => {
    state.allowed = false;
    await notify();
    expect(state.hit).not.toHaveBeenCalled();
    expect(state.handle).toHaveBeenCalledWith("123");
  });

  it("si el limitador falla, se procesa igual (fail-open: nunca perder un pago)", async () => {
    state.signatureFailure = "missing";
    state.hit.mockRejectedValue(new Error("db caída"));
    await notify();
    expect(state.handle).toHaveBeenCalledWith("123");
  });
});
