import { describe, expect, it } from "vitest";
import { estadoRedirect, isOrderId, isPrefetchRequest } from "./estado-link";

const ID = "8a4ffe86-d147-4ebc-bcc6-1fb69ce2ac21";
const at = (path: string) => new URL(`https://www.fotfstudios.cl${path}`);
const headers = (h: Record<string, string>) => new Headers(h);

describe("estadoRedirect", () => {
  it("?b= válido → redirige a la URL limpia y entrega el id para la cookie", () => {
    expect(estadoRedirect(at(`/reserva/estado?b=${ID}`), false)).toEqual({
      location: "https://www.fotfstudios.cl/reserva/estado",
      orderId: ID,
    });
  });

  it("retorno de MP: solo sobrevive la pista status=approved (external_reference es el id otra vez)", () => {
    const r = estadoRedirect(
      at(
        `/reserva/estado?b=${ID}&collection_status=approved&payment_id=123&preference_id=p-1&external_reference=${ID}&merchant_order_id=9`,
      ),
      false,
    );
    expect(r?.location).toBe("https://www.fotfstudios.cl/reserva/estado?status=approved");
  });

  it("pago rechazado o 'Volver a la tienda': sin pista", () => {
    expect(estadoRedirect(at(`/reserva/estado?b=${ID}&status=rejected&payment_id=1`), false)?.location).toBe(
      "https://www.fotfstudios.cl/reserva/estado",
    );
  });

  it("normaliza el id a minúsculas", () => {
    expect(estadoRedirect(at(`/reserva/estado?b=${ID.toUpperCase()}`), false)?.orderId).toBe(ID);
  });

  it("no toca: sin ?b=, ?b= sin forma de uuid, otra ruta o un prefetch", () => {
    expect(estadoRedirect(at("/reserva/estado"), false)).toBeNull();
    expect(estadoRedirect(at("/reserva/estado?status=approved"), false)).toBeNull();
    expect(estadoRedirect(at("/reserva/estado?b=../../admin"), false)).toBeNull();
    expect(estadoRedirect(at(`/reservar?b=${ID}`), false)).toBeNull();
    expect(estadoRedirect(at(`/reserva/estado?b=${ID}`), true)).toBeNull();
  });
});

describe("isPrefetchRequest", () => {
  it("reconoce los prefetch del router de Next y del navegador", () => {
    expect(isPrefetchRequest(headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetchRequest(headers({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetchRequest(headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
  });

  it("una navegación normal (incluida la del router, RSC: 1) no es prefetch", () => {
    expect(isPrefetchRequest(headers({}))).toBe(false);
    expect(isPrefetchRequest(headers({ rsc: "1" }))).toBe(false);
  });
});

describe("isOrderId", () => {
  it("solo uuids", () => {
    expect(isOrderId(ID)).toBe(true);
    expect(isOrderId("abc")).toBe(false);
    expect(isOrderId(undefined)).toBe(false);
  });
});

describe("middleware en /reserva/estado", () => {
  // El middleware real: la rama de estado vuelve antes de tocar Supabase.
  const run = async (path: string, h: Record<string, string> = {}) => {
    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");
    return middleware(new NextRequest(`https://www.fotfstudios.cl${path}`, { headers: h }));
  };

  it("navegación con ?b=: 307 a la URL limpia + cookie httpOnly acotada a la ruta", async () => {
    const res = await run(`/reserva/estado?b=${ID}&collection_status=approved&external_reference=${ID}`);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.fotfstudios.cl/reserva/estado?status=approved");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`fotf_estado=${ID}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/reserva\/estado/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("prefetch del router: no redirige ni fija cookie", async () => {
    const res = await run(`/reserva/estado?b=${ID}`, { "next-router-prefetch": "1" });
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("URL ya limpia: pasa de largo", async () => {
    const res = await run("/reserva/estado");
    expect(res.headers.get("location")).toBeNull();
  });
});
