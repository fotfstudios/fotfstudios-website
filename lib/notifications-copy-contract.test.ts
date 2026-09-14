import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de copy de las notificaciones (auditoría 2026-09-14, H2 + H3).
 *
 * La promesa de acceso vive en varias superficies (plantillas de email, /reserva/estado,
 * el .ics, las plantillas de Supabase Auth) y ya divergió una vez de la operación real:
 * el PIN llega POR EMAIL 10 minutos antes (pg_cron), no "por WhatsApp". Este test pinea
 * la frase en todas y prohíbe el `bone-mute` (#6f6c64, 3.78:1) en texto de email. Las
 * plantillas de Auth ya son TS (templates.ts) y las cubre auth-email.test.ts.
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const EMAIL_TEMPLATES = "src/application/notifications/templates.ts";
const WEB_SURFACES = ["components/booking/EstadoClient.tsx", "components/booking/CalendarButtons.tsx"];

const FORBIDDEN = /acceso por WhatsApp|coordinamos por WhatsApp|Coordinaremos tu acceso|enviar el código de acceso/;

describe("promesa de acceso: por email 10 minutos antes", () => {
  it.each([EMAIL_TEMPLATES, ...WEB_SURFACES])("%s no promete el acceso por WhatsApp", (file) => {
    expect(read(file)).not.toMatch(FORBIDDEN);
  });

  it.each([EMAIL_TEMPLATES, ...WEB_SURFACES])("%s dice que el código llega por email 10 minutos antes", (file) => {
    const src = read(file);
    expect(src).toMatch(/por email/);
    expect(src).toMatch(/10 minutos antes/);
  });

});

describe("contraste AA en email: sin bone-mute (#6f6c64) en texto", () => {
  it.each([EMAIL_TEMPLATES])("%s no usa #6f6c64", (file) => {
    expect(read(file).toLowerCase()).not.toContain("#6f6c64");
  });
});
