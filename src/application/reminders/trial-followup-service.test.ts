import { describe, expect, it, vi } from "vitest";
import {
  noticeDue,
  TrialFollowUpService,
  type TrialCreditCandidate,
  type TrialCreditRepository,
} from "./trial-followup-service";

// Prueba el lunes 5 oct 16:00–17:00 (Chile, UTC−3) → crédito vence el lunes 12 a las 16:00.
const ENDS = "2026-10-05T20:00:00Z";
const EXPIRES = "2026-10-12T19:00:00Z";
const cand = (over: Partial<TrialCreditCandidate> = {}): TrialCreditCandidate => ({
  id: "c1",
  email: "martin@e.cl",
  name: "Martín",
  amount: 19990,
  expiresAt: EXPIRES,
  sessionEndsAt: ENDS,
  followupSentAt: null,
  expiryReminderSentAt: null,
  ...over,
});
const at = (iso: string) => new Date(iso);

describe("noticeDue — cuándo toca cada aviso", () => {
  it("seguimiento: 16 h después del fin de la prueba (a la mañana siguiente), no antes", () => {
    expect(noticeDue(cand(), "followup", at("2026-10-06T11:59:00Z"))).toBe(false);
    expect(noticeDue(cand(), "followup", at("2026-10-06T12:00:00Z"))).toBe(true);
  });

  it("seguimiento: no se repite ni existe para un crédito emitido a mano (sin prueba)", () => {
    expect(noticeDue(cand({ followupSentAt: "2026-10-06T12:00:00Z" }), "followup", at("2026-10-07T00:00:00Z"))).toBe(false);
    expect(noticeDue(cand({ sessionEndsAt: null }), "followup", at("2026-10-07T00:00:00Z"))).toBe(false);
  });

  it("vencimiento: desde 48 h antes de vencer, y nunca después de vencido", () => {
    expect(noticeDue(cand(), "expiring", at("2026-10-10T18:59:00Z"))).toBe(false);
    expect(noticeDue(cand(), "expiring", at("2026-10-10T19:00:00Z"))).toBe(true);
    expect(noticeDue(cand(), "expiring", at("2026-10-12T19:00:00Z"))).toBe(false);
    expect(noticeDue(cand(), "followup", at("2026-10-13T00:00:00Z"))).toBe(false);
  });

  it("vencimiento: ya avisado no se repite (una extensión lo vuelve a habilitar en la DB)", () => {
    expect(noticeDue(cand({ expiryReminderSentAt: "x" }), "expiring", at("2026-10-11T00:00:00Z"))).toBe(false);
  });
});

describe("TrialFollowUpService.sweep", () => {
  const make = (rows: TrialCreditCandidate[], claim = true) => {
    const repo: TrialCreditRepository = {
      liveCandidates: vi.fn(async () => rows),
      claim: vi.fn(async () => claim),
      release: vi.fn(async () => {}),
    };
    const notifications = { notifyTrialCredit: vi.fn(async () => {}) };
    return { repo, notifications, svc: new TrialFollowUpService(repo, notifications) };
  };

  it("manda el seguimiento con monto y vencimiento", async () => {
    const { svc, notifications, repo } = make([cand()]);
    expect(await svc.sweep(at("2026-10-06T13:00:00Z"))).toEqual({ followups: 1, expiring: 0 });
    expect(repo.claim).toHaveBeenCalledWith("c1", "followup");
    expect(notifications.notifyTrialCredit).toHaveBeenCalledWith("followup", {
      email: "martin@e.cl",
      name: "Martín",
      amount: 19990,
      expiresAt: EXPIRES,
    });
  });

  it("si tocan los dos, sale solo el seguimiento en esta corrida", async () => {
    const { svc, notifications } = make([cand()]);
    await svc.sweep(at("2026-10-11T00:00:00Z"));
    expect(notifications.notifyTrialCredit).toHaveBeenCalledTimes(1);
    expect(notifications.notifyTrialCredit).toHaveBeenCalledWith("followup", expect.anything());
  });

  it("otra corrida ya lo reclamó: no manda", async () => {
    const { svc, notifications } = make([cand()], false);
    expect(await svc.sweep(at("2026-10-06T13:00:00Z"))).toEqual({ followups: 0, expiring: 0 });
    expect(notifications.notifyTrialCredit).not.toHaveBeenCalled();
  });

  it("si el envío falla, suelta el reclamo para reintentar", async () => {
    const { svc, notifications, repo } = make([cand({ followupSentAt: "x" })]);
    notifications.notifyTrialCredit.mockRejectedValueOnce(new Error("smtp"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await svc.sweep(at("2026-10-11T00:00:00Z"))).toEqual({ followups: 0, expiring: 0 });
    expect(repo.release).toHaveBeenCalledWith("c1", "expiring");
    err.mockRestore();
  });
});
