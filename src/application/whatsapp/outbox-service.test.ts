import { describe, expect, it, vi } from "vitest";
import { WhatsAppSendError, type WhatsAppSender } from "@/src/application/ports/whatsapp";
import { nextAttemptAt, WA_MAX_ATTEMPTS, WhatsAppOutboxService, type OutboxRow, type WhatsAppOutboxWorkerRepository } from "./outbox-service";

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: "w1",
  event: "booking_confirmed",
  recipient: "56912345678",
  templateName: "fotf_reserva_confirmada",
  templateParams: { nombre: "Ana" },
  buttonSuffix: "o1",
  attempts: 0,
  ...over,
});

function make(rows: OutboxRow[], sender: WhatsAppSender, configured = true) {
  const queue = [...rows];
  const repo: WhatsAppOutboxWorkerRepository = {
    claim: vi.fn(async (n: number) => queue.splice(0, n)),
    markSent: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  };
  return { repo, service: new WhatsAppOutboxService(repo, sender, configured) };
}
const ok = (): WhatsAppSender => ({ sendTemplate: vi.fn(async () => ({ providerId: "wamid.1" })) });
const failing = (e: unknown): WhatsAppSender => ({ sendTemplate: vi.fn(async () => { throw e; }) });
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("WhatsAppOutboxService.sweep", () => {
  it("sin configurar no reclama nada", async () => {
    const { service, repo } = make([row()], ok(), false);
    expect(await service.sweep()).toEqual({ configured: false, claimed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("manda cada fila con su plantilla y guarda el wamid", async () => {
    const sender = ok();
    const { service, repo } = make([row(), row({ id: "w2", buttonSuffix: null })], sender);
    expect(await service.sweep()).toMatchObject({ claimed: 2, sent: 2 });
    expect(sender.sendTemplate).toHaveBeenCalledWith("56912345678", {
      name: "fotf_reserva_confirmada",
      language: "es",
      params: { nombre: "Ana" },
      buttonSuffix: "o1",
    });
    expect(vi.mocked(sender.sendTemplate).mock.calls[1][1]).not.toHaveProperty("buttonSuffix");
    expect(repo.markSent).toHaveBeenCalledWith("w1", "wamid.1");
  });

  it("reclama en lotes chicos hasta el límite", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ id: `w${i}` }));
    const { service, repo } = make(rows, ok());
    expect(await service.sweep({ limit: 7 })).toMatchObject({ claimed: 7, sent: 7 });
    expect(vi.mocked(repo.claim).mock.calls.map((c) => c[0])).toEqual([5, 2]);
  });

  it("para de reclamar cuando se acaba el presupuesto", async () => {
    let t = 0;
    const rows = Array.from({ length: 10 }, (_, i) => row({ id: `w${i}` }));
    const { service, repo } = make(rows, ok());
    const r = await service.sweep({ budgetMs: 1000, now: () => new Date((t += 600)) });
    expect(r.claimed).toBe(5);
    expect(repo.claim).toHaveBeenCalledTimes(1);
  });

  it("error reintentable: vuelve a la cola con backoff", async () => {
    const q = quiet();
    const { service, repo } = make([row()], failing(new WhatsAppSendError("HTTP 503", 503, true)));
    const now = new Date("2026-10-02T12:00:00Z");
    expect(await service.sweep({ now: () => now })).toMatchObject({ retrying: 1, failed: 0 });
    expect(repo.markFailed).toHaveBeenCalledWith("w1", { error: "HTTP 503", code: 503, next: nextAttemptAt(1, now), terminal: false });
    q.mockRestore();
  });

  it("error terminal de Meta: failed con el código, sin reintento", async () => {
    const q = quiet();
    const { service, repo } = make([row()], failing(new WhatsAppSendError("template does not exist", 132001, false)));
    expect(await service.sweep()).toMatchObject({ failed: 1, retrying: 0 });
    expect(vi.mocked(repo.markFailed).mock.calls[0][1]).toMatchObject({ code: 132001, terminal: true });
    q.mockRestore();
  });

  it("el último intento permitido es terminal aunque el error sea reintentable", async () => {
    const q = quiet();
    const { service, repo } = make([row({ attempts: WA_MAX_ATTEMPTS - 1 })], failing(new WhatsAppSendError("429", 429, true)));
    await service.sweep();
    expect(vi.mocked(repo.markFailed).mock.calls[0][1].terminal).toBe(true);
    q.mockRestore();
  });

  it("un error que no es del proveedor se reintenta", async () => {
    const q = quiet();
    const { service, repo } = make([row()], failing(new Error("socket hang up")));
    await service.sweep();
    expect(vi.mocked(repo.markFailed).mock.calls[0][1]).toMatchObject({ terminal: false, code: null });
    q.mockRestore();
  });
});

describe("nextAttemptAt", () => {
  it("1, 2, 5… minutos y tope en el último escalón", () => {
    const now = new Date(0);
    expect(nextAttemptAt(1, now).getTime()).toBe(60_000);
    expect(nextAttemptAt(2, now).getTime()).toBe(120_000);
    expect(nextAttemptAt(3, now).getTime()).toBe(300_000);
    expect(nextAttemptAt(50, now).getTime()).toBe(120 * 60_000);
  });
});
