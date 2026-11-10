import { describe, expect, it, vi } from "vitest";
import {
  ReviewRequestService,
  type ReviewCandidate,
  type ReviewRequestRepository,
} from "./review-request-service";

const cand = (over: Partial<ReviewCandidate> = {}): ReviewCandidate => ({
  reservationId: "r1",
  customerId: "c1",
  email: "ana@e.cl",
  name: "Ana",
  visit: "sala",
  ...over,
});

const make = (rows: ReviewCandidate[], claim: (id: string) => boolean = () => true) => {
  const repo: ReviewRequestRepository = {
    reviewsDue: vi.fn(async () => rows),
    claimReviewRequested: vi.fn(async (id: string) => claim(id)),
    releaseReviewRequested: vi.fn(async () => {}),
  };
  const notifications = { notifyReviewRequest: vi.fn(async () => {}) };
  return { repo, notifications, svc: new ReviewRequestService(repo, notifications) };
};

describe("ReviewRequestService.sweep", () => {
  it("pide la reseña al cliente reclamado, con el tipo de visita para el copy", async () => {
    const { svc, notifications, repo } = make([cand({ visit: "prueba" })]);
    expect(await svc.sweep()).toEqual({ sent: 1, skippedAlreadyAsked: 0 });
    expect(repo.claimReviewRequested).toHaveBeenCalledWith("c1");
    expect(notifications.notifyReviewRequest).toHaveBeenCalledWith({ email: "ana@e.cl", name: "Ana", visit: "prueba" });
  });

  it("una sola vez por cliente: dos reservas suyas en el mismo barrido → un correo", async () => {
    const claimed = new Set<string>();
    // El primer reclamo del cliente gana; el segundo lo encuentra ya tomado.
    const { svc, notifications } = make(
      [cand({ reservationId: "r1" }), cand({ reservationId: "r2" })],
      (id) => (claimed.has(id) ? false : (claimed.add(id), true)),
    );
    expect(await svc.sweep()).toEqual({ sent: 1, skippedAlreadyAsked: 1 });
    expect(notifications.notifyReviewRequest).toHaveBeenCalledTimes(1);
  });

  it("otra corrida ya reclamó al cliente: no manda", async () => {
    const { svc, notifications } = make([cand()], () => false);
    expect(await svc.sweep()).toEqual({ sent: 0, skippedAlreadyAsked: 1 });
    expect(notifications.notifyReviewRequest).not.toHaveBeenCalled();
  });

  it("si el envío falla, suelta el reclamo para reintentar en la próxima corrida", async () => {
    const { svc, notifications, repo } = make([cand()]);
    notifications.notifyReviewRequest.mockRejectedValueOnce(new Error("smtp"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await svc.sweep()).toEqual({ sent: 0, skippedAlreadyAsked: 0 });
    expect(repo.releaseReviewRequested).toHaveBeenCalledWith("c1");
    err.mockRestore();
  });
});
