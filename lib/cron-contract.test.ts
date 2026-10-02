import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANUAL_HOLD_SWEEP_UTC_HOUR } from "@/src/domain/scheduling/manual-hold-deadline";

/**
 * Los correos de reserva pendiente prometen "paga antes del <fecha>, <hora>", calculado
 * con MANUAL_HOLD_SWEEP_UTC_HOUR: el inicio de la ventana en que corre el cron de reconcile
 * (que es el que corre expire_abandoned_manual_holds). En el plan Hobby el cron tiene
 * precisión de HORA (corre en cualquier minuto de esa hora), así que lo que importa es la
 * hora, no el minuto. Si alguien mueve el cron de hora, este test obliga a mover la
 * constante y los correos siguen diciendo la verdad.
 */
describe("cron de reconcile = ventana de liberación que prometen los correos", () => {
  it("vercel.json /api/cron/reconcile corre en la hora MANUAL_HOLD_SWEEP_UTC_HOUR (UTC)", () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const reconcile = cfg.crons.find((c) => c.path === "/api/cron/reconcile");
    expect(reconcile?.schedule).toMatch(new RegExp(`^\\d{1,2} ${MANUAL_HOLD_SWEEP_UTC_HOUR} \\* \\* \\*$`));
  });
});
