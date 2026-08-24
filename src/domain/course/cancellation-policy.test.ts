import { describe, expect, it } from "vitest";
import {
  COURSE_FULL_REFUND_DAYS,
  courseCancellationPolicy,
  daysUntilFirstSession,
  resolveCourseRefundAmount,
} from "./cancellation-policy";

const S1 = "2026-09-15T23:00:00.000Z"; // sesión 1
const at = (iso: string) => new Date(iso);

describe("courseCancellationPolicy — el acantilado de 7 días", () => {
  it("con 10 días de anticipación devuelve el 100%", () => {
    const t = courseCancellationPolicy(S1, at("2026-09-05T23:00:00.000Z"));
    expect(t.refundPct).toBe(1);
    expect(t.remedies).toContain("refund");
  });

  // Borde inclusivo: el instante límite favorece al alumno, igual que la sala.
  it("a exactamente 7 días todavía devuelve el 100%", () => {
    const t = courseCancellationPolicy(S1, at("2026-09-08T23:00:00.000Z"));
    expect(t.refundPct).toBe(1);
  });

  it("un minuto bajo el corte ya no devuelve dinero", () => {
    const t = courseCancellationPolicy(S1, at("2026-09-08T23:01:00.000Z"));
    expect(t.refundPct).toBe(0);
    expect(t.started).toBe(false);
  });

  // Bajo el corte NO hay medio reembolso: hay alternativas sin dinero. Ese es el
  // punto donde esta política se separa de la escalera 24h/12h de la sala.
  it("bajo el corte ofrece traslado y reemplazante, no plata", () => {
    const t = courseCancellationPolicy(S1, at("2026-09-12T00:00:00.000Z"));
    expect(t.refundPct).toBe(0);
    expect(t.remedies).toEqual(["transfer", "substitute"]);
    expect(t.remedies).not.toContain("refund");
  });

  it("una vez iniciado solo quedan las sesiones reagendables", () => {
    const t = courseCancellationPolicy(S1, at("2026-09-20T00:00:00.000Z"));
    expect(t.started).toBe(true);
    expect(t.refundPct).toBe(0);
    expect(t.remedies).toEqual(["reschedule_sessions"]);
  });

  // Una generación que se arma y no llega a dictarse: no hay fecha contra la cual
  // medir, y quedarse con la plata sería indefendible.
  it("sin sesiones agendadas devuelve todo", () => {
    const t = courseCancellationPolicy(null, at("2026-09-20T00:00:00.000Z"));
    expect(t.refundPct).toBe(1);
    expect(t.daysUntil).toBeNull();
    expect(t.started).toBe(false);
  });

  it("el umbral es el que publican los términos", () => {
    expect(COURSE_FULL_REFUND_DAYS).toBe(7);
  });
});

describe("daysUntilFirstSession", () => {
  it("es negativo cuando el curso ya empezó", () => {
    expect(daysUntilFirstSession(S1, at("2026-09-16T23:00:00.000Z"))).toBeCloseTo(-1, 5);
  });
});

describe("resolveCourseRefundAmount — la política sugiere, el dueño decide", () => {
  const ctx = { firstSessionStartsAt: S1, liveAmountClp: 139990, now: at("2026-09-12T00:00:00.000Z") };

  it("policy bajo el corte no devuelve nada", () => {
    expect(resolveCourseRefundAmount("policy", ctx)).toBeNull();
  });

  it("policy sobre el corte devuelve el saldo vivo", () => {
    expect(resolveCourseRefundAmount("policy", { ...ctx, now: at("2026-09-01T00:00:00.000Z") })).toBe(139990);
  });

  it("el dueño puede forzar total, nada o un monto a mano", () => {
    expect(resolveCourseRefundAmount("full", ctx)).toBe(139990);
    expect(resolveCourseRefundAmount("none", ctx)).toBeNull();
    expect(resolveCourseRefundAmount("custom", { ...ctx, customAmount: 50000 })).toBe(50000);
  });
});
