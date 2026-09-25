import { describe, expect, it, vi } from "vitest";
import type { NewsletterRepository } from "@/src/application/ports/newsletter";
import type { NewsletterSubscribeInput } from "@/src/domain/newsletter/subscribe";
import { NewsletterService } from "./newsletter-service";

const TOKEN = "a".repeat(48);
const input: NewsletterSubscribeInput = {
  email: "ana@example.com",
  source: "curso_dj",
  utm: { source: null, medium: null, campaign: null, content: null, term: null },
  referrerHost: null,
};

function setup(welcome: boolean, unsubscribed: string | null = "ana@example.com") {
  const repo: NewsletterRepository = {
    subscribe: vi.fn().mockResolvedValue({ id: "1", unsubscribeToken: TOKEN, welcome }),
    unsubscribe: vi.fn().mockResolvedValue(unsubscribed),
    list: vi.fn(),
    exportActive: vi.fn(),
  };
  const notifier = { notifyNewsletterWelcome: vi.fn().mockResolvedValue(undefined) };
  return { repo, notifier, svc: new NewsletterService(repo, notifier) };
}

describe("NewsletterService.subscribe", () => {
  it("alta nueva: guarda y manda bienvenida con el token de baja", async () => {
    const { svc, notifier } = setup(true);
    await expect(svc.subscribe(input)).resolves.toEqual({ welcome: true });
    expect(notifier.notifyNewsletterWelcome).toHaveBeenCalledWith({ email: input.email, unsubscribeToken: TOKEN });
  });

  it("ya suscrito: no vuelve a mandar correo", async () => {
    const { svc, notifier } = setup(false);
    await svc.subscribe(input);
    expect(notifier.notifyNewsletterWelcome).not.toHaveBeenCalled();
  });

  it("un fallo del correo no tumba la suscripción", async () => {
    const { svc, notifier } = setup(true);
    notifier.notifyNewsletterWelcome.mockRejectedValue(new Error("resend caído"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(svc.subscribe(input)).resolves.toEqual({ welcome: true });
    err.mockRestore();
  });
});

describe("NewsletterService.unsubscribe", () => {
  it("token con forma inválida no toca la base", async () => {
    const { svc, repo } = setup(true);
    await expect(svc.unsubscribe("nope")).resolves.toEqual({ ok: false });
    expect(repo.unsubscribe).not.toHaveBeenCalled();
  });

  it("token válido devuelve el email", async () => {
    const { svc } = setup(true);
    await expect(svc.unsubscribe(TOKEN)).resolves.toEqual({ ok: true, email: "ana@example.com" });
  });

  it("token desconocido → ok:false", async () => {
    const { svc } = setup(true, null);
    await expect(svc.unsubscribe(TOKEN)).resolves.toEqual({ ok: false });
  });
});
