import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANUAL_HOLD_SWEEP_UTC } from "@/src/domain/scheduling/manual-hold-deadline";

/**
 * Los correos de reserva pendiente dicen "te guardamos la hora hasta el <fecha>, <hora>",
 * calculado con MANUAL_HOLD_SWEEP_UTC. Esa hora es la del cron de reconcile (que es el que
 * corre expire_abandoned_manual_holds): si alguien mueve el cron, este test obliga a mover
 * la constante y los correos siguen diciendo la verdad.
 */
describe("cron de reconcile = hora de liberación que prometen los correos", () => {
  it("vercel.json /api/cron/reconcile corre a MANUAL_HOLD_SWEEP_UTC", () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const reconcile = cfg.crons.find((c) => c.path === "/api/cron/reconcile");
    expect(reconcile?.schedule).toBe(`${MANUAL_HOLD_SWEEP_UTC.minute} ${MANUAL_HOLD_SWEEP_UTC.hour} * * *`);
  });
});
