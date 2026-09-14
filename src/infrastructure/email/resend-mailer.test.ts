import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async () => ({ data: { id: "e1" }, error: null }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { ResendMailer } from "./resend-mailer";

const msg = {
  to: "ana@e.cl",
  template: "customerConfirmation",
  subject: "s",
  html: "<p>h</p>",
  text: "t",
};

beforeEach(() => send.mockClear());

describe("ResendMailer", () => {
  it("manda from, to, subject, html, text y el tag de plantilla", async () => {
    await new ResendMailer("key", "FOTF <reservas@fotfstudios.cl>").send(msg);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "FOTF <reservas@fotfstudios.cl>",
        to: "ana@e.cl",
        subject: "s",
        html: "<p>h</p>",
        text: "t",
        tags: [{ name: "template", value: "customerConfirmation" }],
      }),
    );
    expect(send.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  it("con replyTo configurado, las respuestas van al buzón que el dueño lee", async () => {
    await new ResendMailer("key", "FOTF <reservas@fotfstudios.cl>", "hola@fotfstudios.cl").send(msg);
    expect(send.mock.calls[0][0]).toMatchObject({ replyTo: "hola@fotfstudios.cl" });
  });

  it("adjuntos: pasan tal cual", async () => {
    await new ResendMailer("key", "f").send({ ...msg, attachments: [{ filename: "a.ics", content: "BEGIN:VCALENDAR" }] });
    expect(send.mock.calls[0][0]).toMatchObject({ attachments: [{ filename: "a.ics", content: "BEGIN:VCALENDAR" }] });
  });

  it("un error del proveedor se lanza con su mensaje", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: "API key is invalid", name: "validation_error" } } as never);
    await expect(new ResendMailer("key", "f").send(msg)).rejects.toThrow("API key is invalid");
  });
});
