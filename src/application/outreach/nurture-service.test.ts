import { describe, it, expect, vi } from "vitest";
import { NurtureService } from "./nurture-service";
import type { LeadsRepository, NurtureCandidate } from "@/src/application/ports/outreach";
import type { NotificationService } from "@/src/application/notifications/notification-service";

const ENROLLED = "2026-01-01T12:00:00.000Z";
const NOW = new Date(Date.parse(ENROLLED) + 3 * 86_400_000); // día 3: 'tip' (día 2) vencido

function candidate(over: Partial<NurtureCandidate> = {}): NurtureCandidate {
  return {
    id: "lead-1",
    email: "ana@example.com",
    name: "Ana",
    unsubscribeToken: "a".repeat(48),
    enrolledAt: ENROLLED,
    consentAt: ENROLLED,
    unsubscribedAt: null,
    tipSentAt: null,
    trialSentAt: null,
    courseSentAt: null,
    checkinSentAt: null,
    ...over,
  };
}

/** Repo falso: candidates fijo + spies de claim/release/touch/advance. */
function fakeRepo(candidates: NurtureCandidate[], over: Partial<LeadsRepository> = {}) {
  return {
    candidates: vi.fn(async () => candidates),
    claimStep: vi.fn(async () => true),
    releaseStep: vi.fn(async () => {}),
    recordTouch: vi.fn(async () => {}),
    advance: vi.fn(async () => {}),
    ...over,
  } as unknown as LeadsRepository & {
    candidates: ReturnType<typeof vi.fn>;
    claimStep: ReturnType<typeof vi.fn>;
    releaseStep: ReturnType<typeof vi.fn>;
    recordTouch: ReturnType<typeof vi.fn>;
    advance: ReturnType<typeof vi.fn>;
  };
}

function fakeNotifications() {
  return { notifyNurtureStep: vi.fn(async () => {}) } as unknown as Pick<NotificationService, "notifyNurtureStep"> & {
    notifyNurtureStep: ReturnType<typeof vi.fn>;
  };
}

describe("NurtureService.sweep", () => {
  it("manda el paso vencido, lo reclama, deja toque y avanza el embudo", async () => {
    const repo = fakeRepo([candidate()]);
    const notifs = fakeNotifications();
    const res = await new NurtureService(repo, notifs).sweep(NOW);

    expect(res.sent).toBe(1);
    expect(repo.claimStep).toHaveBeenCalledWith("lead-1", "tip");
    expect(notifs.notifyNurtureStep).toHaveBeenCalledWith("tip", {
      email: "ana@example.com",
      name: "Ana",
      token: "a".repeat(48),
    });
    expect(repo.recordTouch).toHaveBeenCalledWith("ana@example.com", "nurture_sent", { step: "tip" });
    expect(repo.advance).toHaveBeenCalledWith("ana@example.com", "contactado");
  });

  it("no manda nada si no hay paso vencido", async () => {
    const repo = fakeRepo([candidate({ tipSentAt: ENROLLED })]); // tip ya mandado; trial (día 5) aún no
    const notifs = fakeNotifications();
    const res = await new NurtureService(repo, notifs).sweep(NOW);
    expect(res.sent).toBe(0);
    expect(notifs.notifyNurtureStep).not.toHaveBeenCalled();
  });

  it("si otro barrido ya reclamó el paso, no manda (idempotencia)", async () => {
    const repo = fakeRepo([candidate()], { claimStep: vi.fn(async () => false) });
    const notifs = fakeNotifications();
    const res = await new NurtureService(repo, notifs).sweep(NOW);
    expect(res.sent).toBe(0);
    expect(notifs.notifyNurtureStep).not.toHaveBeenCalled();
  });

  it("si el envío falla, suelta el reclamo y no cuenta", async () => {
    const notifs = fakeNotifications();
    notifs.notifyNurtureStep.mockRejectedValueOnce(new Error("resend 500"));
    const repo = fakeRepo([candidate()]);
    const res = await new NurtureService(repo, notifs).sweep(NOW);
    expect(res.sent).toBe(0);
    expect(repo.releaseStep).toHaveBeenCalledWith("lead-1", "tip");
    expect(repo.recordTouch).not.toHaveBeenCalled();
  });
});
