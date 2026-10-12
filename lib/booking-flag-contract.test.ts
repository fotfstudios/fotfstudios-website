import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Qué cubre `NEXT_PUBLIC_BOOKING_ENABLED` (`bookingEnabled()`).
 *
 * El flag decide si se puede INICIAR una reserva en línea: la página de checkout y las
 * dos rutas que la alimentan. La página de retorno de pago NO va detrás del flag: los
 * links de cobro del admin y el delta de reagendamiento ya mandan al comprador a
 * `/reserva/estado` (back_urls de MP con auto_return), así que con el flag apagado quien
 * pagaba veía un 404 aunque el webhook confirmara el pago.
 */
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const GATED = [
  // El gate de /reservar vive en su layout: un 404 real (la página tiene loading.tsx).
  "app/(booking)/reservar/layout.tsx",
  "app/api/bookings/route.ts",
  "app/api/promos/first-booking/route.ts",
  "app/api/checkout/login-hint/route.ts",
];

const UNGATED = [
  "app/(booking)/reserva/estado/page.tsx",
  // "Ya transferí" desde /reserva/estado: sirve aunque el checkout se apague después.
  "app/api/orders/[id]/transfer/route.ts",
];

describe("contrato del flag de reservas", () => {
  it.each(GATED)("%s sigue detrás de bookingEnabled()", (rel) => {
    expect(read(rel)).toMatch(/if \(!bookingEnabled\(\)\)/);
  });

  it.each(UNGATED)("%s no depende del flag (retorno de pagos del admin)", (rel) => {
    // Import o llamada; mencionarlo en un comentario está bien.
    const src = read(rel);
    expect(src).not.toMatch(/import[^;]*\bbookingEnabled\b/);
    expect(src).not.toMatch(/bookingEnabled\(\)\)/);
  });
});
