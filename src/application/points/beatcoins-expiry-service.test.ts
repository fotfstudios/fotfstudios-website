import { describe, expect, it, vi } from "vitest";
import {
  BeatcoinsExpiryService,
  MAX_EMAILS_PER_RUN,
  type BeatcoinsDueCandidate,
  type BeatcoinsExpiredCandidate,
  type BeatcoinsExpiryRepository,
  type BeatcoinsNotice,
} from "./beatcoins-expiry-service";

const dueC = (id: string, extra: Partial<BeatcoinsDueCandidate> = {}): BeatcoinsDueCandidate => ({
  customerId: id,
  email: `${id}@e.cl`,
  name: "Ana",
  expirable: 500,
  protected: 1000,
  expiresAt: "2028-03-15T18:00:00Z",
  ...extra,
});
const expiredC = (id: string): BeatcoinsExpiredCandidate => ({ customerId: id, email: `${id}@e.cl`, name: null, expired: 300, remaining: 0 });

function repo(over: { expired?: BeatcoinsExpiredCandidate[]; d7?: BeatcoinsDueCandidate[]; d30?: BeatcoinsDueCandidate[] } = {}) {
  const claimed = new Set<string>();
  const r = {
    expire: vi.fn(async () => 2),
    expiredPending: vi.fn(async () => over.expired ?? []),
    due: vi.fn(async (days: 7 | 30) => (days === 7 ? (over.d7 ?? []) : (over.d30 ?? []))),
    claim: vi.fn(async (id: string, n: BeatcoinsNotice) => {
      const k = `${id}:${n}`;
      if (claimed.has(k)) return false;
      claimed.add(k);
      return true;
    }),
    release: vi.fn(async (id: string, n: BeatcoinsNotice) => {
      claimed.delete(`${id}:${n}`);
    }),
  } satisfies BeatcoinsExpiryRepository;
  return r;
}
const notifier = () => ({
  notifyBeatcoinsExpiring: vi.fn<(v: { email: string }) => Promise<void>>(async () => {}),
  notifyBeatcoinsExpired: vi.fn<(v: { email: string }) => Promise<void>>(async () => {}),
});

describe("BeatcoinsExpiryService.sweep", () => {
  it("vence primero y luego avisa: vencidos, 7 días y 30 días", async () => {
    const r = repo({ expired: [expiredC("a")], d7: [dueC("b")], d30: [dueC("c")] });
    const n = notifier();
    const res = await new BeatcoinsExpiryService(r, n).sweep();
    expect(res).toEqual({ expired: 2, expiredNotices: 1, notices7: 1, notices30: 1, failed: 0 });
    expect(r.expire.mock.invocationCallOrder[0]).toBeLessThan(r.expiredPending.mock.invocationCallOrder[0]);
    expect(n.notifyBeatcoinsExpired).toHaveBeenCalledWith({ email: "a@e.cl", name: null, expired: 300, remaining: 0 });
    expect(n.notifyBeatcoinsExpiring).toHaveBeenCalledWith({
      email: "b@e.cl",
      name: "Ana",
      expiring: 500,
      permanent: 1000,
      expiresAt: "2028-03-15T18:00:00Z",
    });
    expect(r.claim).toHaveBeenCalledWith("b", "n7");
    expect(r.claim).toHaveBeenCalledWith("c", "n30");
  });

  it("a lo más un correo por cliente y corrida", async () => {
    const r = repo({ expired: [expiredC("a")], d7: [dueC("a")] });
    const n = notifier();
    const res = await new BeatcoinsExpiryService(r, n).sweep();
    expect(res.expiredNotices + res.notices7).toBe(1);
    expect(n.notifyBeatcoinsExpiring).not.toHaveBeenCalled();
  });

  it("si otra corrida ya lo reclamó, no manda", async () => {
    const r = repo({ d7: [dueC("a")] });
    await r.claim("a", "n7");
    const n = notifier();
    expect((await new BeatcoinsExpiryService(r, n).sweep()).notices7).toBe(0);
    expect(n.notifyBeatcoinsExpiring).not.toHaveBeenCalled();
  });

  it("si el envío falla, suelta el reclamo y lo cuenta como fallo", async () => {
    const r = repo({ d30: [dueC("a")] });
    const n = notifier();
    n.notifyBeatcoinsExpiring.mockRejectedValueOnce(new Error("resend down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await new BeatcoinsExpiryService(r, n).sweep();
    expect(res).toMatchObject({ notices30: 0, failed: 1 });
    expect(r.release).toHaveBeenCalledWith("a", "n30");
    expect(await r.claim("a", "n30")).toBe(true); // reclamable de nuevo mañana
  });

  it(`no pasa de ${MAX_EMAILS_PER_RUN} correos por corrida`, async () => {
    const many = Array.from({ length: MAX_EMAILS_PER_RUN + 5 }, (_, i) => dueC(`c${i}`));
    const r = repo({ d30: many });
    const n = notifier();
    const res = await new BeatcoinsExpiryService(r, n).sweep();
    expect(res.notices30).toBe(MAX_EMAILS_PER_RUN);
    expect(r.claim).toHaveBeenCalledTimes(MAX_EMAILS_PER_RUN); // los demás ni se reclaman
  });
});
