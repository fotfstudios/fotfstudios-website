/**
 * GET /api/orders/[id]/status — la página de retorno confirma "sola" reconciliando contra
 * MP cuando el webhook aún no llegó (o nunca llega, como en sandbox). Si el sondeo gana la
 * carrera, el webhook cae como duplicado y SU aviso no sale: los emails de confirmación
 * tienen que salir de acá. Se mockea la composición (única costura de la ruta).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  order: { status: "pending_payment", amount_clp: 9990, currency: "CLP" },
  reservation: { status: "held", expires_at: new Date(Date.now() + 5 * 60_000).toISOString() },
  reconcile: vi.fn(),
  notifyOrder: vi.fn(async () => true),
  notifyPaymentNeedsReview: vi.fn(async () => true),
  /** Lo que responde el limitador de reconciliaciones por IP. */
  allowed: true,
  hit: vi.fn(),
}));

vi.mock("@/src/composition", () => {
  // Cliente falso: solo la cadena que usa la ruta (from → select → eq → [limit] → single|maybeSingle).
  const fakeDb = () => ({
    from: (table: string) => {
      const row = table === "orders" ? state.order : state.reservation;
      const b = {
        select: () => b,
        eq: () => b,
        limit: () => b,
        single: async () => ({ data: row }),
        maybeSingle: async () => ({ data: row }),
      };
      return b;
    },
  });
  return {
    db: fakeDb,
    reconcileOrder: state.reconcile,
    rateLimiter: () => ({ hit: state.hit }),
    notificationService: () => ({
      notifyOrder: state.notifyOrder,
      notifyPaymentNeedsReview: state.notifyPaymentNeedsReview,
    }),
  };
});

import { GET } from "@/app/api/orders/[id]/status/route";

const ORDER = "8a4ffe86-d147-4ebc-bcc6-1fb69ce2ac21";
const call = () => GET(new Request(`http://localhost/api/orders/${ORDER}/status`), { params: Promise.resolve({ id: ORDER }) });

beforeEach(() => {
  state.order = { status: "pending_payment", amount_clp: 9990, currency: "CLP" };
  state.reservation = { status: "held", expires_at: new Date(Date.now() + 5 * 60_000).toISOString() };
  state.reconcile.mockReset();
  state.allowed = true;
  state.hit.mockReset();
  state.hit.mockImplementation(async () => state.allowed);
  state.notifyOrder.mockClear();
  state.notifyPaymentNeedsReview.mockClear();
});

describe("GET /api/orders/[id]/status — emails cuando el sondeo reconcilia", () => {
  it("reconcile → paid: manda la confirmación (notifyOrder) y responde paid", async () => {
    state.reconcile.mockImplementation(async () => {
      state.order = { ...state.order, status: "paid" };
      return { result: "paid", orderId: ORDER };
    });
    const res = await call();
    expect((await res.json()).status).toBe("paid");
    expect(state.notifyOrder).toHaveBeenCalledWith(ORDER);
    expect(state.notifyPaymentNeedsReview).not.toHaveBeenCalled();
  });

  it("reconcile → pending (MP aún no aprueba): sin emails", async () => {
    state.reconcile.mockResolvedValue({ result: "pending", orderId: ORDER });
    await call();
    expect(state.notifyOrder).not.toHaveBeenCalled();
    expect(state.notifyPaymentNeedsReview).not.toHaveBeenCalled();
  });

  it("pedido ya pagado: no reconcilia ni vuelve a avisar (el que confirmó ya avisó)", async () => {
    state.order = { ...state.order, status: "paid" };
    await call();
    expect(state.reconcile).not.toHaveBeenCalled();
    expect(state.notifyOrder).not.toHaveBeenCalled();
  });
});

describe("GET /api/orders/[id]/status — tope de reconciliaciones por IP", () => {
  it("sobre el tope no consulta a MP, pero responde el estado desde la DB", async () => {
    state.allowed = false;
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pending_payment");
    expect(state.reconcile).not.toHaveBeenCalled();
  });

  it("un pedido ya pagado no gasta cupo del limitador (ni consulta a MP)", async () => {
    state.order = { ...state.order, status: "paid" };
    state.allowed = false;
    expect((await (await call()).json()).status).toBe("paid");
    expect(state.hit).not.toHaveBeenCalled();
    expect(state.reconcile).not.toHaveBeenCalled();
  });
});
