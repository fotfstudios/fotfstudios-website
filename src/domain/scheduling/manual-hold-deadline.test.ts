import { describe, expect, it } from "vitest";
import { MANUAL_HOLD_HOURS, MANUAL_HOLD_SWEEP_UTC_HOUR, manualHoldDeadline, manualHoldFreesAt } from "./manual-hold-deadline";

/**
 * El cron de reconcile corre en Hobby con precisión de hora: `30 12 * * *` puede correr
 * entre 12:00 y 12:59 UTC. La promesa tiene que ser una hora en la que la reserva
 * SEGURO sigue guardada, sea cual sea el minuto en que corra el barrido.
 */
describe("manualHoldFreesAt — promesa segura con cron de precisión horaria", () => {
  it("72 h antes de la ventana del día → ese día a las 12:00 UTC (09:00 CL)", () => {
    const created = "2026-10-05T03:00:00Z"; // + 72 h = jue 03:00 UTC
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });

  it("72 h después de la ventana del día → al día siguiente a las 12:00 UTC", () => {
    const created = "2026-10-05T14:00:00Z"; // + 72 h = jue 14:00 UTC
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });

  it("72 h DENTRO de la ventana (12:10) → ese mismo día 12:00: el barrido de las 12:40 ya la libera", () => {
    const created = "2026-10-05T12:10:00Z"; // + 72 h = jue 12:10 UTC
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });

  it("72 h justo a las 13:00 → ese día 12:00 (el barrido de ese día no la alcanza; prometer antes es seguro)", () => {
    const created = "2026-10-05T13:00:00Z";
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });

  it("72 h a las 13:01 → al día siguiente: ningún barrido de ese día (≤ 12:59) la alcanza", () => {
    const created = "2026-10-05T13:01:00Z";
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });

  it("propiedad: para cualquier minuto de corrida del barrido, la reserva sigue guardada a la hora prometida", () => {
    // Recorre relojes a lo largo de un día cada 7 min; para cada uno, el primer barrido
    // (cualquier minuto 12:00–12:59) que la libera nunca corre antes de la promesa.
    for (let m = 0; m < 24 * 60; m += 7) {
      const clock = Date.UTC(2026, 9, 5, 0, m);
      const promise = manualHoldFreesAt(new Date(clock), new Date(clock)).getTime();
      const deadline = clock + 72 * 3600_000;
      for (let day = 7; day <= 10; day++) {
        for (const runMin of [0, 1, 30, 59]) {
          const run = Date.UTC(2026, 9, day, 12, runMin);
          if (deadline < run) expect(run).toBeGreaterThanOrEqual(promise); // si libera, es después de la promesa
        }
      }
      expect(promise).toBeGreaterThanOrEqual(deadline - 3600_000); // y nunca promete mucho menos que 72 h
    }
  });

  it("si ya pasó (cron caído), nombra la próxima ventana, nunca una pasada", () => {
    const created = "2026-10-01T14:00:00Z";
    const now = new Date("2026-10-08T15:00:00Z");
    expect(manualHoldFreesAt(created, now).toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });

  it("acepta Date además de ISO", () => {
    const created = new Date("2026-10-05T14:00:00Z");
    expect(manualHoldFreesAt(created, created).toISOString()).toBe("2026-10-09T12:00:00.000Z");
  });

  it("constantes = default del SQL y hora del cron de reconcile", () => {
    expect(MANUAL_HOLD_HOURS).toBe(72);
    expect(MANUAL_HOLD_SWEEP_UTC_HOUR).toBe(12);
  });
});

describe("manualHoldDeadline — hay que pagar antes del inicio de la sesión", () => {
  const created = "2026-10-02T16:25:00Z"; // vie 13:25 CL → promesa: mar 6, 12:00 UTC (09:00 CL)

  it("sesión antes de que venza el hold de 72 h → manda el inicio de la sesión", () => {
    const starts = "2026-10-02T17:00:00Z"; // hoy 14:00 CL
    expect(manualHoldDeadline(created, starts, new Date(created)).toISOString()).toBe("2026-10-02T17:00:00.000Z");
  });

  it("sesión después del hold → manda el barrido (reloj desde la creación)", () => {
    const starts = "2026-10-20T21:00:00Z";
    expect(manualHoldDeadline(created, starts, new Date(created)).toISOString()).toBe("2026-10-06T12:00:00.000Z");
  });

  it("sin inicio conocido, cae al barrido", () => {
    expect(manualHoldDeadline(created, null, new Date(created)).toISOString()).toBe("2026-10-06T12:00:00.000Z");
  });
});
