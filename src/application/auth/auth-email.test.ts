import { describe, expect, it } from "vitest";
import { authEmailsFor, type SendEmailHookPayload } from "./auth-email";

const SB = "https://abc.supabase.co";
const base = (over: Partial<SendEmailHookPayload["email_data"]> = {}, user: Partial<SendEmailHookPayload["user"]> = {}): SendEmailHookPayload => ({
  user: { id: "u1", email: "ana@e.cl", new_email: null, ...user },
  email_data: {
    token: "12345678",
    token_hash: "hash-A",
    redirect_to: "https://www.fotfstudios.cl/auth/callback",
    email_action_type: "magiclink",
    site_url: "https://www.fotfstudios.cl",
    token_new: "",
    token_hash_new: "",
    ...over,
  },
});

describe("authEmailsFor — del payload del hook a los correos", () => {
  it("magiclink: código de inicio de sesión + link de verificación al email del usuario", () => {
    const [m] = authEmailsFor(base(), { supabaseUrl: SB });
    expect(m.to).toBe("ana@e.cl");
    expect(m.template).toBe("authLoginCode");
    expect(m.subject).toContain("12345678");
    expect(m.html).toContain("12345678");
    expect(m.html).toContain(`${SB}/auth/v1/verify?token=hash-A&amp;type=magiclink&amp;redirect_to=https%3A%2F%2Fwww.fotfstudios.cl%2Fauth%2Fcallback`);
    expect(m.text).toContain("12345678");
  });

  it("signup (cliente nuevo por magic link) usa la MISMA plantilla que magiclink", () => {
    const [m] = authEmailsFor(base({ email_action_type: "signup" }), { supabaseUrl: SB });
    expect(m.template).toBe("authLoginCode");
    expect(m.html).toContain("type=signup");
  });

  it("recovery: plantilla de recuperación", () => {
    const [m] = authEmailsFor(base({ email_action_type: "recovery" }), { supabaseUrl: SB });
    expect(m.template).toBe("authRecovery");
    expect(m.subject).toMatch(/recuperar/i);
  });

  it("email_change con doble confirmación: dos correos, y los hashes van CRUZADOS (token→token_hash_new al actual)", () => {
    const out = authEmailsFor(
      base({ email_action_type: "email_change", token: "111111", token_hash: "hash-new", token_new: "222222", token_hash_new: "hash-cur" }, { new_email: "nueva@e.cl" }),
      { supabaseUrl: SB },
    );
    expect(out.map((m) => m.to)).toEqual(["ana@e.cl", "nueva@e.cl"]);
    expect(out[0].html).toContain("111111");
    expect(out[0].html).toContain("token=hash-cur");
    expect(out[1].html).toContain("222222");
    expect(out[1].html).toContain("token=hash-new");
    expect(out.every((m) => m.template === "authEmailChange")).toBe(true);
  });

  it("email_change simple (un solo par): un correo a la dirección nueva", () => {
    const out = authEmailsFor(
      base({ email_action_type: "email_change", token: "111111", token_hash: "hash-new" }, { new_email: "nueva@e.cl" }),
      { supabaseUrl: SB },
    );
    expect(out.map((m) => m.to)).toEqual(["nueva@e.cl"]);
    expect(out[0].html).toContain("111111");
  });

  it("tipo desconocido con token: código de verificación genérico; sin token: nada que mandar", () => {
    const [m] = authEmailsFor(base({ email_action_type: "reauthentication" }), { supabaseUrl: SB });
    expect(m.template).toBe("authVerificationCode");
    expect(authEmailsFor(base({ email_action_type: "password_changed_notification", token: "" }), { supabaseUrl: SB })).toEqual([]);
  });

  it("ninguna plantilla de Auth habla de la clave de la sala como WhatsApp ni usa bone-mute", () => {
    for (const type of ["magiclink", "recovery"] as const) {
      const [m] = authEmailsFor(base({ email_action_type: type }), { supabaseUrl: SB });
      expect(m.html).not.toMatch(/WhatsApp/);
      expect(m.html.toLowerCase()).not.toContain("#6f6c64");
      expect(m.html).toMatch(/10 minutos antes/);
    }
  });
});
