import { describe, expect, it, vi } from "vitest";
import { PaymentService, type PaymentServiceConfig } from "./payment-service";
import type { PaymentGateway } from "@/src/application/ports/payment";
import type { OrderPaymentRepository } from "@/src/application/ports/orders";

function makeGateway(over: Partial<PaymentGateway> = {}): PaymentGateway {
  return {
    createPreference: vi.fn(async () => ({ preferenceId: "pref_1", initPoint: "https://mp/init" })),
    getPayment: vi.fn(),
    findPaymentByOrder: vi.fn(),
    refundPayment: vi.fn(),
    ...over,
  } as PaymentGateway;
}

function makeRepo(): OrderPaymentRepository {
  return {
    getOrderForPayment: vi.fn(async () => ({
      id: "o1",
      amount: 19990,
      currency: "CLP",
      email: "cliente@example.com",
      name: "Ana Pérez Soto",
    })),
    recordPreference: vi.fn(async () => {}),
    pendingOrderIds: vi.fn(async () => []),
  };
}

function makeService(gw: PaymentGateway, repo: OrderPaymentRepository, config?: Partial<PaymentServiceConfig>) {
  return new PaymentService(gw, repo, { siteUrl: "https://www.fotfstudios.cl", ...config });
}

describe("PaymentService.createPreferenceForOrder", () => {
  it("por defecto NO manda notification_url (MP notifica vía Webhooks del panel, firma validable)", async () => {
    const gw = makeGateway();
    const repo = makeRepo();
    await makeService(gw, repo).createPreferenceForOrder("o1");
    expect(gw.createPreference).toHaveBeenCalledWith(expect.objectContaining({ notificationUrl: undefined }));
  });

  it("con notificationUrl configurada (MP_NOTIFICATION_URL) la pasa tal cual", async () => {
    const gw = makeGateway();
    const repo = makeRepo();
    const tunnel = "https://tunel.example.dev/api/webhooks/mercadopago";
    await makeService(gw, repo, { notificationUrl: tunnel }).createPreferenceForOrder("o1");
    expect(gw.createPreference).toHaveBeenCalledWith(expect.objectContaining({ notificationUrl: tunnel }));
  });

  it("back_urls apuntan a la página de estado de la reserva", async () => {
    const gw = makeGateway();
    const repo = makeRepo();
    await makeService(gw, repo).createPreferenceForOrder("o1");
    const back = "https://www.fotfstudios.cl/reserva/estado?b=o1";
    expect(gw.createPreference).toHaveBeenCalledWith(
      expect.objectContaining({ backUrls: { success: back, failure: back, pending: back } }),
    );
  });

  it("registra la preference creada (provider mercadopago + preferenceId devuelto)", async () => {
    const gw = makeGateway();
    const repo = makeRepo();
    const res = await makeService(gw, repo).createPreferenceForOrder("o1");
    expect(res.ok).toBe(true);
    expect(repo.recordPreference).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o1", provider: "mercadopago", preferenceId: "pref_1" }),
    );
  });

  it("pedido inexistente → err sin llamar a MP", async () => {
    const gw = makeGateway();
    const repo = makeRepo();
    (repo.getOrderForPayment as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await makeService(gw, repo).createPreferenceForOrder("nope");
    expect(res.ok).toBe(false);
    expect(gw.createPreference).not.toHaveBeenCalled();
  });
});
