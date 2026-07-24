import { describe, expect, it } from "vitest";
import { applicantConfirmation, customerAccessCode, customerCancellation, customerConfirmation, customerCourtesyConfirmation, ownerNewApplication, ownerNotification } from "./templates";

const view = {
  name: "Ana",
  when: "lunes 1 de enero, 10:00 h",
  total: "$9.990",
  lines: [{ description: "Sala · 1h", amount: "$9.990" }],
};

describe("email templates", () => {
  it("confirmación al cliente incluye total y WhatsApp", () => {
    const m = customerConfirmation(view, { address: "Los Chercanes 78a", whatsappUrl: "https://wa.me/56962803298" });
    expect(m.subject).toMatch(/confirmada/i);
    expect(m.html).toContain("$9.990");
    expect(m.html).toContain("https://wa.me/56962803298");
    expect(m.html).toContain("Los Chercanes 78a");
  });

  it("aviso al dueño recuerda acceso y boleta", () => {
    const m = ownerNotification({ ...view, email: "ana@e.cl" });
    expect(m.html).toMatch(/boleta/i);
    expect(m.html).toContain("ana@e.cl");
  });

  it("cancelación CON reembolso: monto + WhatsApp; sin línea confrontacional", () => {
    const m = customerCancellation(
      { name: "Ana", when: view.when, refunded: "$9.995" },
      { whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(m.subject).toMatch(/cancelada/i);
    expect(m.html).toContain("$9.995");
    expect(m.html).toMatch(/medio de pago original/);
    expect(m.html).toContain("https://wa.me/56962803298");
  });

  it("cancelación SIN reembolso: sin línea de dinero", () => {
    const m = customerCancellation(
      { name: null, when: view.when, refunded: null },
      { whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(m.html).not.toContain("reembolsamos");
    expect(m.text).not.toContain("reembolsamos");
    expect(m.html).toContain("cancelada");
  });

  it("cancelación escapa el nombre (anti-XSS)", () => {
    const m = customerCancellation(
      { name: "<img src=x>", when: view.when, refunded: null },
      { whatsappUrl: "https://wa.me/1" },
    );
    expect(m.html).not.toContain("<img src=x>");
    expect(m.html).toContain("&lt;img");
  });

  it("escapa datos del cliente (anti-XSS)", () => {
    const m = ownerNotification({
      ...view,
      name: "<script>alert(1)</script>",
      email: "a@e.cl",
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});

describe("cortesía", () => {
  const ctx = {
    address: "Los Chercanes 78a",
    whatsappUrl: "https://wa.me/56962803298",
    termsUrl: "https://www.fotfstudios.cl/terminos",
    privacyUrl: "https://www.fotfstudios.cl/privacidad",
  };

  it("confirma la sesión sin cobro: horario, dirección, WhatsApp y T&C", () => {
    const m = customerCourtesyConfirmation({ name: "Ana", when: view.when, addonNames: [] }, ctx);
    expect(m.subject).toMatch(/cortesía/i);
    expect(m.html).toContain("sin cobro");
    expect(m.html).toContain(view.when);
    expect(m.html).toContain("Los Chercanes 78a");
    expect(m.html).toContain("https://wa.me/56962803298");
    expect(m.html).toContain("https://www.fotfstudios.cl/terminos");
    expect(m.html).toContain("https://www.fotfstudios.cl/privacidad");
    expect(m.text).toContain("https://www.fotfstudios.cl/terminos");
    expect(m.text).toContain("https://www.fotfstudios.cl/privacidad");
  });

  it("no menciona dinero: sin Total, sin montos, sin IVA", () => {
    const m = customerCourtesyConfirmation({ name: "Ana", when: view.when, addonNames: [] }, ctx);
    expect(m.html).not.toContain("Total");
    expect(m.html).not.toMatch(/\$\d/);
    expect(m.html).not.toContain("IVA");
    expect(m.text).not.toContain("Total");
    expect(m.text).not.toMatch(/\$\d/);
  });

  it("con extras: línea Incluye con los nombres", () => {
    const m = customerCourtesyConfirmation({ name: "Ana", when: view.when, addonNames: ["Humo", "Luces"] }, ctx);
    expect(m.html).toContain("Incluye");
    expect(m.html).toContain("Humo");
    expect(m.html).toContain("Luces");
    expect(m.text).toContain("Humo");
  });

  it("sin extras: sin línea Incluye", () => {
    const m = customerCourtesyConfirmation({ name: "Ana", when: view.when, addonNames: [] }, ctx);
    expect(m.html).not.toContain("Incluye");
    expect(m.text).not.toContain("Incluye");
  });

  it("sin nombre: sin saludo, igual renderiza", () => {
    const m = customerCourtesyConfirmation({ name: null, when: view.when, addonNames: [] }, ctx);
    expect(m.html).not.toContain("Hola");
    expect(m.html).toContain("sin cobro");
  });

  it("escapa nombre y extras (anti-XSS)", () => {
    const m = customerCourtesyConfirmation(
      { name: "<img src=x>", when: view.when, addonNames: ["<b>x</b>"] },
      ctx,
    );
    expect(m.html).not.toContain("<img src=x>");
    expect(m.html).toContain("&lt;img");
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;");
  });
});

describe("código de acceso", () => {
  const ctx = { address: "Los Chercanes 78a", whatsappUrl: "https://wa.me/56962803298" };

  it("incluye código, horario, dirección y WhatsApp", () => {
    const m = customerAccessCode({ name: "Ana", when: view.when, code: "1234#" }, ctx);
    expect(m.subject).toMatch(/acceso/i);
    expect(m.html).toContain("1234#");
    expect(m.html).toContain(view.when);
    expect(m.html).toContain("Los Chercanes 78a");
    expect(m.html).toContain("https://wa.me/56962803298");
    expect(m.text).toContain("1234#");
    expect(m.text).toContain(view.when);
  });

  it("sin dinero ni montos", () => {
    const m = customerAccessCode({ name: "Ana", when: view.when, code: "1234" }, ctx);
    expect(m.html).not.toContain("Total");
    expect(m.html).not.toMatch(/\$\d/);
  });

  it("sin nombre: sin saludo, igual renderiza", () => {
    const m = customerAccessCode({ name: null, when: view.when, code: "1234" }, ctx);
    expect(m.html).not.toContain("Hola");
    expect(m.html).toContain("1234");
  });

  it("escapa nombre y código (anti-XSS)", () => {
    const m = customerAccessCode(
      { name: "<img src=x>", when: view.when, code: "<script>1</script>" },
      ctx,
    );
    expect(m.html).not.toContain("<img src=x>");
    expect(m.html).toContain("&lt;img");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});

describe("postulación de DJ — aviso al dueño", () => {
  const app = {
    name: "Valentina",
    email: "vale@correo.cl",
    phone: "+56912345678",
    format: "ambas" as const,
    availability: "Tardes de semana y sábados",
    mixUrl: "https://soundcloud.com/vale/set",
    instagram: "vale.dj",
    genres: "House, techno",
    pitch: "Llevo 5 años pinchando en Valpo.",
  };

  it("incluye contacto, link al set y el pitch", () => {
    const m = ownerNewApplication(app);
    expect(m.subject).toMatch(/postulaci[oó]n/i);
    expect(m.subject).toContain("Valentina");
    expect(m.html).toContain("mailto:vale@correo.cl");
    expect(m.html).toContain("https://wa.me/56912345678"); // teléfono normalizado → wa.me
    expect(m.html).toContain("https://soundcloud.com/vale/set");
    expect(m.html).toContain("Llevo 5 años pinchando en Valpo.");
    expect(m.text).toContain("vale@correo.cl");
    expect(m.text).toContain("https://soundcloud.com/vale/set");
  });

  it("muestra el formato (etiqueta legible) y la disponibilidad", () => {
    const m = ownerNewApplication(app);
    expect(m.html).toContain("Ambas"); // etiqueta, no "ambas"
    expect(m.html).toContain("Tardes de semana y sábados");
    expect(m.text).toContain("Tardes de semana y sábados");
  });

  it("traduce cada formato a su etiqueta", () => {
    expect(ownerNewApplication({ ...app, format: "clases" }).html).toContain("Clases grupales");
    expect(ownerNewApplication({ ...app, format: "uno_a_uno" }).html).toContain("Sesiones 1:1");
  });

  it("omite Instagram y géneros cuando son null", () => {
    const m = ownerNewApplication({ ...app, instagram: null, genres: null });
    expect(m.html).not.toMatch(/instagram/i);
    expect(m.html).not.toMatch(/géneros/i);
  });

  it("muestra Instagram y géneros cuando existen", () => {
    const m = ownerNewApplication(app);
    expect(m.html).toContain("vale.dj");
    expect(m.html).toContain("House, techno");
  });

  it("escapa el pitch y el nombre (anti-XSS)", () => {
    const m = ownerNewApplication({ ...app, name: "<img src=x>", pitch: "<script>alert(1)</script>" });
    expect(m.html).not.toContain("<img src=x>");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});

describe("postulación de DJ — confirmación al postulante", () => {
  it("agradece, menciona WhatsApp de seguimiento y escapa el nombre", () => {
    const m = applicantConfirmation({ name: "Valentina" }, { whatsappUrl: "https://wa.me/56962803298" });
    expect(m.subject).toMatch(/postulaci[oó]n/i);
    expect(m.html).toContain("Valentina");
    expect(m.html).toContain("https://wa.me/56962803298");
    expect(m.text).toContain("https://wa.me/56962803298");
  });

  it("escapa el nombre (anti-XSS)", () => {
    const m = applicantConfirmation({ name: "<img src=x>" }, { whatsappUrl: "https://wa.me/1" });
    expect(m.html).not.toContain("<img src=x>");
    expect(m.html).toContain("&lt;img");
  });
});
