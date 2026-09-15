import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock se iza al tope del archivo: los stubs tienen que nacer en vi.hoisted.
const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: "m1" }));
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
});
vi.mock("nodemailer", () => ({ default: { createTransport }, createTransport }));

import { SmtpMailer } from "./smtp-mailer";

const msg = {
  to: "ana@e.cl",
  template: "authLoginCode",
  subject: "s",
  html: "<p>h</p>",
  text: "t",
};

beforeEach(() => {
  sendMail.mockClear();
  createTransport.mockClear();
});

describe("SmtpMailer", () => {
  it("abre el transporte con la URL SMTP y manda from, to, subject, html y text", async () => {
    await new SmtpMailer("smtp://127.0.0.1:54325", "FOTF <reservas@fotfstudios.cl>").send(msg);
    expect(createTransport).toHaveBeenCalledWith("smtp://127.0.0.1:54325");
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "FOTF <reservas@fotfstudios.cl>",
        to: "ana@e.cl",
        subject: "s",
        html: "<p>h</p>",
        text: "t",
      }),
    );
    expect(sendMail.mock.calls[0][0]).not.toHaveProperty("replyTo");
    expect(sendMail.mock.calls[0][0]).not.toHaveProperty("attachments");
  });

  it("con replyTo y adjuntos, los pasa tal cual (el .ics viaja como texto)", async () => {
    const mailer = new SmtpMailer("smtp://127.0.0.1:54325", "FOTF <reservas@fotfstudios.cl>", "hola@fotfstudios.cl");
    await mailer.send({ ...msg, attachments: [{ filename: "reserva-fotf.ics", content: "BEGIN:VCALENDAR" }] });
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      replyTo: "hola@fotfstudios.cl",
      attachments: [{ filename: "reserva-fotf.ics", content: "BEGIN:VCALENDAR" }],
    });
  });

  it("un solo transporte por instancia, aunque mande varias veces", async () => {
    const mailer = new SmtpMailer("smtp://127.0.0.1:54325", "FOTF <reservas@fotfstudios.cl>");
    await mailer.send(msg);
    await mailer.send({ ...msg, to: "b@e.cl" });
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("propaga el error del transporte (LoggedMailer lo registra como fallo)", async () => {
    sendMail.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(new SmtpMailer("smtp://127.0.0.1:54325", "FOTF <x@y.cl>").send(msg)).rejects.toThrow("ECONNREFUSED");
  });
});
