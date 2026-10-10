import { describe, expect, it, vi } from "vitest";
import {
  BeatcoinsCampaignService,
  CAMPAIGN_MAX_PER_RUN,
  digestMonthStart,
  type BeatcoinsCampaignRepository,
  type CampaignCandidate,
} from "./beatcoins-campaign-service";

const cand = (id: string): CampaignCandidate => ({
  customerId: id,
  email: `${id}@e.cl`,
  name: null,
  balance: 1000,
  protected: 1000,
  activityAt: null,
  unsubscribeToken: "a".repeat(48),
  digestSentAt: null,
});

const AFTER = new Date("2026-12-03T15:00:00Z");
const BEFORE = new Date("2026-10-20T15:00:00Z");

function repo(launch: CampaignCandidate[] = [], digest: CampaignCandidate[] = []) {
  const taken = new Set<string>();
  const claim = async (k: string) => (taken.has(k) ? false : (taken.add(k), true));
  return {
    launchAudience: vi.fn(async () => 0),
    queueLaunch: vi.fn(async () => 0),
    launchStatus: vi.fn(async () => ({ queued: 0, sent: 0 })),
    launchPending: vi.fn(async (limit: number) => launch.slice(0, limit)),
    digestPending: vi.fn(async (_m: string, _l: string, limit: number) => digest.slice(0, limit)),
    claimLaunch: vi.fn((id: string) => claim(`l:${id}`)),
    releaseLaunch: vi.fn(async (id: string) => void taken.delete(`l:${id}`)),
    claimDigest: vi.fn((id: string) => claim(`d:${id}`)),
    releaseDigest: vi.fn(async (id: string) => void taken.delete(`d:${id}`)),
    unsubscribeDigest: vi.fn(async () => true),
  } satisfies BeatcoinsCampaignRepository;
}
const notifier = () => ({
  notifyBeatcoinsLaunch: vi.fn<(c: CampaignCandidate) => Promise<void>>(async () => {}),
  notifyBeatcoinsDigest: vi.fn<(c: CampaignCandidate) => Promise<void>>(async () => {}),
});

describe("digestMonthStart", () => {
  it("es el inicio del mes en Chile, en UTC", () => {
    expect(digestMonthStart(new Date("2026-12-03T15:00:00Z"))).toBe("2026-12-01T03:00:00.000Z");
    // 02:00 UTC del 1-12 = 23:00 del 30-11 en Chile: todavía es noviembre.
    expect(digestMonthStart(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11-01T03:00:00.000Z");
  });
});

describe("BeatcoinsCampaignService.sweep", () => {
  it("manda el anuncio encolado; antes del corte no hay resumen", async () => {
    const r = repo([cand("a"), cand("b")], [cand("c")]);
    const n = notifier();
    expect(await new BeatcoinsCampaignService(r, n).sweep(BEFORE)).toEqual({ launch: 2, digest: 0, failed: 0 });
    expect(r.digestPending).not.toHaveBeenCalled();
  });

  it("después del corte manda el resumen del mes, con la marca del mes y sin anuncio reciente", async () => {
    const r = repo([], [cand("c")]);
    const n = notifier();
    expect(await new BeatcoinsCampaignService(r, n).sweep(AFTER)).toEqual({ launch: 0, digest: 1, failed: 0 });
    expect(r.digestPending).toHaveBeenCalledWith("2026-12-01T03:00:00.000Z", "2026-11-13T15:00:00.000Z", CAMPAIGN_MAX_PER_RUN);
    expect(r.claimDigest).toHaveBeenCalledWith("c", "2026-12-01T03:00:00.000Z");
    expect(n.notifyBeatcoinsDigest).toHaveBeenCalledWith(cand("c"));
  });

  it("un envío fallido suelta el reclamo (el resumen vuelve a su valor anterior)", async () => {
    const prev = { ...cand("c"), digestSentAt: "2026-11-02T13:00:00Z" };
    const r = repo([cand("a")], [prev]);
    const n = notifier();
    n.notifyBeatcoinsLaunch.mockRejectedValueOnce(new Error("down"));
    n.notifyBeatcoinsDigest.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await new BeatcoinsCampaignService(r, n).sweep(AFTER)).toEqual({ launch: 0, digest: 0, failed: 2 });
    expect(r.releaseLaunch).toHaveBeenCalledWith("a");
    expect(r.releaseDigest).toHaveBeenCalledWith("c", "2026-11-02T13:00:00Z");
  });

  it(`el tope de ${CAMPAIGN_MAX_PER_RUN} se comparte entre anuncio y resumen`, async () => {
    const launch = Array.from({ length: CAMPAIGN_MAX_PER_RUN - 10 }, (_, i) => cand(`l${i}`));
    const digest = Array.from({ length: 50 }, (_, i) => cand(`d${i}`));
    const r = repo(launch, digest);
    const res = await new BeatcoinsCampaignService(r, notifier()).sweep(AFTER);
    expect(res).toEqual({ launch: CAMPAIGN_MAX_PER_RUN - 10, digest: 10, failed: 0 });
  });

  it("otro proceso ya lo reclamó: no manda", async () => {
    const r = repo([cand("a")]);
    await r.claimLaunch("a");
    const n = notifier();
    expect((await new BeatcoinsCampaignService(r, n).sweep(BEFORE)).launch).toBe(0);
    expect(n.notifyBeatcoinsLaunch).not.toHaveBeenCalled();
  });
});
