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
  "app/(booking)/reservar/page.tsx",
  "app/api/bookings/route.ts",
  "app/api/promos/first-booking/route.ts",
];

const UNGATED = ["app/(booking)/reserva/estado/page.tsx"];

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
