import { describe, expect, it, vi } from "vitest";
import { ACCESS_SEND_WINDOW_MINUTES, AccessCodeService, type AccessCodeRepository } from "./access-code-service";

type Due = Awaited<ReturnType<AccessCodeRepository["accessCodesDue"]>>[number];

const due = (over: Partial<Due> = {}): Due => ({
  id: "r1",
  code: "482917",
  startsAt: "2026-07-12T18:00:00Z",
  customerName: "Ana",
  customerEmail: "ana@e.cl",
  ...over,
});

function fakeRepo(over: Partial<AccessCodeRepository> = {}): AccessCodeRepository {
  return {
    assignMissingAccessCodes: vi.fn().mockResolvedValue(0),
    accessCodesDue: vi.fn().mockResolvedValue([]),
    markAccessSent: vi.fn().mockResolvedValue(true),
    releaseAccessSent: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const notifier = (over: Partial<{ notifyAccessCode: ReturnType<typeof vi.fn> }> = {}) => ({
  notifyAccessCode: vi.fn().mockResolvedValue(true),
  ...over,
});

describe("AccessCodeService.sweep", () => {
  it("genera los que faltan y reporta cuántos", async () => {
    const repo = fakeRepo({ assignMissingAccessCodes: vi.fn().mockResolvedValue(3) });
    const r = await new AccessCodeService(repo, notifier()).sweep();
    expect(r.generated).toBe(3);
    expect(repo.assignMissingAccessCodes).toHaveBeenCalledTimes(1);
  });

  it("usa la ventana de 15 minutos por defecto: con cron cada 5, una de 10 deja huecos", async () => {
    const repo = fakeRepo();
    await new AccessCodeService(repo, notifier()).sweep();
    expect(repo.accessCodesDue).toHaveBeenCalledWith(ACCESS_SEND_WINDOW_MINUTES);
    expect(ACCESS_SEND_WINDOW_MINUTES).toBe(15);
  });

  it("manda el PIN de cada reserva debida, con sus datos", async () => {
    const repo = fakeRepo({ accessCodesDue: vi.fn().mockResolvedValue([due(), due({ id: "r2", code: "111222", customerEmail: "b@e.cl" })]) });
    const n = notifier();
    const r = await new AccessCodeService(repo, n).sweep();
    expect(r.sent).toBe(2);
    expect(n.notifyAccessCode).toHaveBeenCalledWith({ email: "ana@e.cl", name: "Ana", startsAt: "2026-07-12T18:00:00Z", code: "482917" });
  });

  /**
   * La que importa: reclamar ANTES de mandar. Si otra corrida del cron (o un
   * reintento) ya reclamó la reserva, esta no manda. Es lo único que impide que
   * el mismo PIN llegue dos veces.
   */
  it("reclama antes de mandar y NO manda si el reclamo falla (otra corrida ganó)", async () => {
    const order: string[] = [];
    const repo = fakeRepo({
      accessCodesDue: vi.fn().mockResolvedValue([due()]),
      markAccessSent: vi.fn(async () => {
        order.push("claim");
        return false;
      }),
    });
    const n = notifier({
      notifyAccessCode: vi.fn(async () => {
        order.push("send");
        return true;
      }),
    });
    const r = await new AccessCodeService(repo, n).sweep();
    expect(r.sent).toBe(0);
    expect(n.notifyAccessCode).not.toHaveBeenCalled();
    expect(order).toEqual(["claim"]);
  });

  it("el reclamo va antes del envío, no después", async () => {
    const order: string[] = [];
    const repo = fakeRepo({
      accessCodesDue: vi.fn().mockResolvedValue([due()]),
      markAccessSent: vi.fn(async () => {
        order.push("claim");
        return true;
      }),
    });
    const n = notifier({
      notifyAccessCode: vi.fn(async () => {
        order.push("send");
        return true;
      }),
    });
    await new AccessCodeService(repo, n).sweep();
    expect(order).toEqual(["claim", "send"]);
  });

  /**
   * Si el correo falla, se suelta el reclamo: la próxima corrida reintenta.
   * Dejarlo marcado mostraría "Enviado" cuando el cliente no recibió nada.
   */
  it("si el envío falla, suelta el reclamo y no cuenta el envío", async () => {
    const repo = fakeRepo({ accessCodesDue: vi.fn().mockResolvedValue([due()]) });
    const n = notifier({ notifyAccessCode: vi.fn().mockRejectedValue(new Error("resend down")) });
    const r = await new AccessCodeService(repo, n).sweep();
    expect(r.sent).toBe(0);
    expect(repo.releaseAccessSent).toHaveBeenCalledWith("r1");
  });

  it("un fallo en una reserva no frena a las demás", async () => {
    const repo = fakeRepo({ accessCodesDue: vi.fn().mockResolvedValue([due(), due({ id: "r2", customerEmail: "b@e.cl" })]) });
    const n = notifier({
      notifyAccessCode: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(true),
    });
    const r = await new AccessCodeService(repo, n).sweep();
    expect(r.sent).toBe(1);
    expect(repo.releaseAccessSent).toHaveBeenCalledTimes(1);
  });

  it("sin email no reclama ni manda: lo cuenta aparte para que el dueño lo vea", async () => {
    const repo = fakeRepo({ accessCodesDue: vi.fn().mockResolvedValue([due({ customerEmail: null })]) });
    const n = notifier();
    const r = await new AccessCodeService(repo, n).sweep();
    expect(r).toEqual({ generated: 0, sent: 0, skippedNoEmail: 1 });
    expect(repo.markAccessSent).not.toHaveBeenCalled();
    expect(n.notifyAccessCode).not.toHaveBeenCalled();
  });
});
