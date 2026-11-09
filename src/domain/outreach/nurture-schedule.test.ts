import { describe, it, expect } from "vitest";
import { nextStepDue, NURTURE_STEPS, type NurtureLead } from "./nurture-schedule";

const base: NurtureLead = {
  enrolledAt: "2026-01-01T12:00:00.000Z",
  consentAt: "2026-01-01T12:00:00.000Z",
  unsubscribedAt: null,
  tipSentAt: null,
  trialSentAt: null,
  courseSentAt: null,
  checkinSentAt: null,
};

/** enrolledAt + `days` (en ms). */
function at(days: number): Date {
  return new Date(Date.parse(base.enrolledAt!) + days * 86_400_000);
}

describe("nextStepDue", () => {
  it("no manda nada antes del día 2", () => {
    expect(nextStepDue(base, at(1.99))).toBeNull();
  });

  it("manda 'tip' justo al cumplir el día 2", () => {
    expect(nextStepDue(base, at(2))).toBe("tip");
  });

  it("después de 'tip', espera hasta el día 5 para 'trial'", () => {
    const lead = { ...base, tipSentAt: at(2).toISOString() };
    expect(nextStepDue(lead, at(3))).toBeNull();
    expect(nextStepDue(lead, at(5))).toBe("trial");
  });

  it("un paso por barrido aunque varios estén vencidos (se pone al día)", () => {
    // tip ya enviado; en el día 20 trial, course y checkin están todos vencidos → trial primero.
    const lead = { ...base, tipSentAt: at(2).toISOString() };
    expect(nextStepDue(lead, at(20))).toBe("trial");
  });

  it("checkin es el último (día 14) y luego no hay más", () => {
    const lead: NurtureLead = {
      ...base,
      tipSentAt: at(2).toISOString(),
      trialSentAt: at(5).toISOString(),
      courseSentAt: at(9).toISOString(),
    };
    expect(nextStepDue(lead, at(14))).toBe("checkin");
    const done = { ...lead, checkinSentAt: at(14).toISOString() };
    expect(nextStepDue(done, at(99))).toBeNull();
  });

  it("sin consentimiento nunca manda", () => {
    expect(nextStepDue({ ...base, consentAt: null }, at(10))).toBeNull();
  });

  it("dado de baja nunca manda", () => {
    expect(nextStepDue({ ...base, unsubscribedAt: at(1).toISOString() }, at(10))).toBeNull();
  });

  it("sin enrolledAt nunca manda", () => {
    expect(nextStepDue({ ...base, enrolledAt: null }, at(10))).toBeNull();
  });

  it("el calendario tiene los 4 pasos en cadencia creciente", () => {
    expect(NURTURE_STEPS.map((s) => s.key)).toEqual(["tip", "trial", "course", "checkin"]);
    expect(NURTURE_STEPS.map((s) => s.afterDays)).toEqual([2, 5, 9, 14]);
  });
});
