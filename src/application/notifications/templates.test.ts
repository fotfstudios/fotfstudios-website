import { describe, expect, it } from "vitest";
import { TRANSFER } from "@/lib/site";
import { applicantConfirmation, courseEnrollmentCancelled, courseSessionReminder, courseEnrollmentPaid, courseEnrollmentPending, courseReviewRequest, ownerCoursePaid, ownerNewCourseLead, bookingHeldPending, bookingPaymentPending, bookingPaymentReminder, courseEnrollmentRefunded, ownerDuplicatePayment, customerCourtesyCancelled, customerHoldExpired, customerPaymentNoSlot, customerReminder, customerReschedule, customerRescheduleFailed, customerAccessCode, customerCancellation, customerConfirmation, customerCourtesyConfirmation, customerPointsBalance, guideDelivery, ownerNewApplication, ownerNotification } from "./templates";

const links = {
  statusUrl: "https://www.fotfstudios.cl/reserva/estado?b=o1",
  calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=x",
  accountUrl: "https://www.fotfstudios.cl/cuenta",
};
const MAPS = "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a";
const confCtx = { address: "Los Chercanes 78a", mapsUrl: MAPS, whatsappUrl: "https://wa.me/56962803298", links };

const view = {
  name: "Ana",
  when: "lunes 1 de enero, 10:00 h",
  total: "$9.990",
  lines: [{ description: "Sala · 1h", amount: "$9.990" }],
};

describe("email templates", () => {
  it("confirmación al cliente incluye total y WhatsApp", () => {
    const m = customerConfirmation(view, confCtx);
    expect(m.subject).toMatch(/confirmada/i);
    expect(m.html).toContain("$9.990");
    expect(m.html).toContain("https://wa.me/56962803298");
    expect(m.html).toContain("Los Chercanes 78a");
  });

  it("confirmación: el código de acceso llega por email 10 minutos antes, no por WhatsApp", () => {
    const m = customerConfirmation(view, confCtx);
    expect(m.html).toMatch(/por email/);
    expect(m.html).toMatch(/10 minutos antes/);
    expect(m.html).not.toMatch(/acceso por WhatsApp/);
    expect(m.text).toMatch(/por email/);
    expect(m.text).not.toMatch(/acceso por WhatsApp/);
  });

  it("confirmación: enlaza a la reserva, al calendario y a la cuenta (H8)", () => {
    const m = customerConfirmation(view, confCtx);
    expect(m.html).toContain('href="https://www.fotfstudios.cl/reserva/estado?b=o1"');
    expect(m.html).toContain('href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=x"');
    expect(m.html).toContain('href="https://www.fotfstudios.cl/cuenta"');
    expect(m.html).toMatch(/Ver mi reserva/);
    expect(m.text).toContain("https://www.fotfstudios.cl/reserva/estado?b=o1");
    expect(m.text).toContain("https://www.fotfstudios.cl/cuenta");
  });

  it("la dirección es un link propio a Maps (Gmail no la auto-enlaza en azul sobre Ink)", () => {
    const m = customerConfirmation(view, confCtx);
    const href = `<a href="${MAPS.replaceAll("&", "&amp;")}"`; // & escapado en el atributo
    expect(m.html).toContain(href);
    const a = m.html.indexOf(href);
    expect(m.html.slice(a, m.html.indexOf("</a>", a))).toContain(">Los Chercanes 78a");
  });

  it("sin nombre, la frase arranca con mayúscula; con nombre, saluda", () => {
    expect(customerConfirmation({ ...view, name: null }, confCtx).html).toContain(">Tu sesión quedó reservada.");
    expect(customerConfirmation(view, confCtx).html).toContain(">Hola Ana, tu sesión quedó reservada.");
  });

  it("aviso al dueño recuerda cargar el PIN en la cerradura y la boleta (ya no 'enviar el código')", () => {
    const m = ownerNotification({ ...view, email: "ana@e.cl" });
    expect(m.html).toMatch(/boleta/i);
    expect(m.html).toMatch(/cargar el PIN/i);
    expect(m.html).not.toMatch(/enviar el código/i);
    expect(m.text).toMatch(/cargar/i);
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
    mapsUrl: MAPS,
    whatsappUrl: "https://wa.me/56962803298",
    termsUrl: "https://www.fotfstudios.cl/terminos",
    privacyUrl: "https://www.fotfstudios.cl/privacidad",
    links: { calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=c", accountUrl: "https://www.fotfstudios.cl/cuenta" },
  };

  it("lleva la sesión al calendario y a la cuenta, como la confirmación pagada", () => {
    const m = customerCourtesyConfirmation({ name: "Ana", when: view.when, addonNames: [] }, ctx);
    expect(m.html).toContain('href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=c"');
    expect(m.html).toContain('href="https://www.fotfstudios.cl/cuenta"');
    expect(m.text).toContain("https://www.fotfstudios.cl/cuenta");
  });

  it("sin nombre, la frase arranca con mayúscula", () => {
    const m = customerCourtesyConfirmation({ name: null, when: view.when, addonNames: [] }, ctx);
    expect(m.html).toContain(">Tu sesión quedó reservada.");
    expect(m.html).not.toContain(">tu sesión");
  });

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

  it("el código de acceso llega por email 10 minutos antes, no por WhatsApp", () => {
    const m = customerCourtesyConfirmation({ name: "Ana", when: view.when, addonNames: [] }, ctx);
    expect(m.html).toMatch(/por email/);
    expect(m.html).toMatch(/10 minutos antes/);
    expect(m.html).not.toMatch(/acceso por WhatsApp/);
    expect(m.text).not.toMatch(/acceso por WhatsApp/);
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
  const ctx = { address: "Los Chercanes 78a", mapsUrl: MAPS, whatsappUrl: "https://wa.me/56962803298" };

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

describe("cancelación de una orden 100% puntos", () => {
  it("dice que se repusieron puntos; nunca habla de plata ni de tarjeta", () => {
    const m = customerCancellation(
      { name: "Ana", when: view.when, refunded: null, restoredPoints: 14990 },
      { whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(m.html).toContain("14.990 puntos");
    expect(m.text).toContain("14.990 puntos");
    expect(m.html).not.toMatch(/medio de pago original|tarjeta|reembolsamos/);
    expect(m.text).not.toMatch(/medio de pago original|reembolsamos/);
  });
});

describe("reembolso de inscripción de curso (pagada)", () => {
  it("con monto: dice cuánto se devolvió y al medio de pago original", () => {
    const m = courseEnrollmentRefunded(
      { name: "Ana", generation: "G3", refunded: "$149.990" },
      { whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(m.subject).toMatch(/cancelada/i);
    expect(m.html).toContain("$149.990");
    expect(m.html).toContain("medio de pago original");
    expect(m.text).toContain("$149.990");
    expect(m.text).toContain("medio de pago original");
    expect(m.html).toContain("https://wa.me/56962803298");
  });

  it("sin monto: no dice que no hubo cobro ni habla de dinero", () => {
    const m = courseEnrollmentRefunded(
      { name: "Ana", generation: "G3", refunded: null },
      { whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(m.html).not.toMatch(/ningún cobro|reembolsamos|tarjeta|\$/);
    expect(m.text).not.toMatch(/ningún cobro|reembolsamos|\$/);
  });

  it("escapa el nombre (anti-XSS)", () => {
    const m = courseEnrollmentRefunded(
      { name: "<b>Ana</b>", generation: "<i>G3</i>", refunded: null },
      { whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(m.html).not.toContain("<b>Ana</b>");
    expect(m.html).not.toContain("<i>G3</i>");
    expect(m.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
  });
});

const GUIDE_KEY_COPY = {
  templateKey: "guideDelivery:guia-dj",
  subject: "s",
  preheader: "p",
  h1: "h",
  blurb: "b",
  ctaLabel: "c",
  name: "n",
};

describe("bitácora: cada plantilla se identifica con su propio nombre", () => {
  it("customerConfirmation lleva template = 'customerConfirmation'", () => {
    const m = customerConfirmation(view, confCtx);
    expect(m.template).toBe("customerConfirmation");
  });

  /**
   * `guideDelivery` es la única plantilla cuya clave NO es un literal: la trae la guía,
   * como `guideDelivery:<slug>`, para que notification_log distinga una entrega que
   * rebota de otra. La invariante se mantiene —cada plantilla se identifica con su
   * nombre—, solo que para esta se comprueba llamándola en vez de leyendo el archivo.
   */
  const CLAVE_PARAMETRIZADA = ["guideDelivery"];

  it("toda función exportada de templates.ts devuelve template con su nombre", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./templates.ts", import.meta.url), "utf8");
    const names = [...src.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      if (CLAVE_PARAMETRIZADA.includes(name)) continue;
      expect(src, `${name} sin template`).toContain(`template: "${name}"`);
    }
  });

  it("guideDelivery se identifica con su nombre más el slug de la guía", () => {
    const m = guideDelivery(
      { downloadUrl: "https://x.example/d", copy: { ...GUIDE_KEY_COPY, templateKey: "guideDelivery:guia-dj" } },
      { whatsappUrl: "https://wa.me/1" },
    );
    expect(m.template).toMatch(/^guideDelivery:[a-z0-9-]+$/);
    // Así `like 'guideDelivery%'` sigue trayendo todas las entregas de una sola vez.
    expect(m.template.startsWith("guideDelivery")).toBe(true);
  });
});

describe("recordatorio de sesión (H9)", () => {
  const ctx = { address: "Los Chercanes 78a", mapsUrl: MAPS, whatsappUrl: "https://wa.me/56962803298", statusUrl: "https://www.fotfstudios.cl/reserva/estado?b=o1" };

  it("dice cuándo, dónde, que el PIN llega por email 10 minutos antes, y enlaza a la reserva", () => {
    const m = customerReminder({ name: "Ana", when: "martes 15 de septiembre, 14:00–16:00 h" }, ctx);
    expect(m.subject).toMatch(/mañana|tu sesión/i);
    expect(m.html).toContain("martes 15 de septiembre, 14:00–16:00 h");
    expect(m.html).toContain("Los Chercanes 78a");
    expect(m.html).toMatch(/por email 10 minutos antes/);
    expect(m.html).toContain('href="https://www.fotfstudios.cl/reserva/estado?b=o1"');
    expect(m.html).toContain("https://wa.me/56962803298");
    expect(m.text).toContain("martes 15 de septiembre, 14:00–16:00 h");
    expect(m.text).toContain("https://www.fotfstudios.cl/reserva/estado?b=o1");
  });

  it("no habla de dinero ni dice 'mañana' en el cuerpo (la ventana es ancha)", () => {
    const m = customerReminder({ name: null, when: "martes 15 de septiembre, 14:00 h" }, ctx);
    expect(m.html).not.toMatch(/\$|Total|IVA/);
    expect(m.html).not.toMatch(/mañana/i);
  });

  it("escapa el nombre (anti-XSS)", () => {
    const m = customerReminder({ name: "<b>Ana</b>", when: "x" }, ctx);
    expect(m.html).not.toContain("<b>Ana</b>");
  });
});

describe("estados que antes eran silencio (H6)", () => {
  const wa = "https://wa.me/56962803298";

  it("pago sin cupo: reconoce el pago, dice que el horario ya no estaba y promete WhatsApp; nunca 'confirmada'", () => {
    const m = customerPaymentNoSlot({ name: "Ana", when: "lunes 1 de enero, 10:00–11:00 h", total: "$9.990" }, { whatsappUrl: wa });
    expect(m.subject).toMatch(/recibimos tu pago/i);
    expect(m.html).toContain("$9.990");
    expect(m.html).toContain("lunes 1 de enero, 10:00–11:00 h");
    expect(m.html).toMatch(/ya no estaba disponible/);
    expect(m.html).toMatch(/WhatsApp/);
    expect(m.html).not.toMatch(/confirmada/i);
    expect(m.text).toMatch(/ya no estaba disponible/);
  });

  it("hora liberada: sin pago, se liberó; ofrece reservar de nuevo", () => {
    const m = customerHoldExpired({ name: "Ana", when: "lunes 1 de enero, 10:00–11:00 h" }, { whatsappUrl: wa, bookUrl: "https://www.fotfstudios.cl/reservar" });
    expect(m.subject).toMatch(/se liberó/i);
    expect(m.html).toMatch(/no recibimos el pago/);
    expect(m.html).toContain('href="https://www.fotfstudios.cl/reservar"');
    expect(m.text).toContain("https://www.fotfstudios.cl/reservar");
    expect(m.html).not.toMatch(/reembols|cobro|tarjeta/);
  });

  it("cortesía cancelada: sin una palabra de dinero", () => {
    const m = customerCourtesyCancelled({ name: "Ana", when: "lunes 1 de enero, 10:00–11:00 h" }, { whatsappUrl: wa });
    expect(m.subject).toMatch(/cancelada/i);
    expect(m.html).toContain("lunes 1 de enero, 10:00–11:00 h");
    expect(m.html).not.toMatch(/\$|reembols|cobro|tarjeta|puntos/i);
    expect(m.html).toContain(wa);
  });
});

describe("shell del correo (H11/H13)", () => {
  const m = customerConfirmation(view, confCtx);

  it("es un documento completo: doctype, lang es, color-scheme dark, tabla contenedora con bgcolor", () => {
    expect(m.html.trimStart().toLowerCase().startsWith("<!doctype html>")).toBe(true);
    expect(m.html).toContain('<html lang="es"');
    expect(m.html).toContain('<meta name="color-scheme" content="dark">');
    expect(m.html).toContain('<meta name="supported-color-schemes" content="dark">');
    expect(m.html).toContain('role="presentation"');
    expect(m.html).toContain('bgcolor="#0a0a0a"');
    expect(m.html).toContain("<title>FOTF Studios</title>");
  });

  it("preheader oculto con la fecha (lo que Gmail muestra como snippet)", () => {
    expect(m.html).toMatch(/display:none[^>]*>[^<]*lunes 1 de enero, 10:00 h/);
  });

  it("CTA con alto táctil (padding 14px 22px) y sin franjas laterales (border-left)", () => {
    expect(m.html).toContain("padding:14px 22px");
    expect(m.html).not.toMatch(/border-left:\s*[2-9]px/);
    const owner = ownerNewApplication({
      name: "Ana", email: "a@e.cl", phone: "+56912345678", format: "clases", availability: "fines de semana",
      mixUrl: "https://soundcloud.com/x", instagram: null, genres: null, pitch: "hola",
    } as Parameters<typeof ownerNewApplication>[0]);
    expect(owner.html).not.toMatch(/border-left:\s*[2-9]px/);
  });

  it("link de pago sin nombre: saluda sin 'Hola:'", () => {
    const p = bookingPaymentPending(
      { name: null, when: view.when, total: "$9.990", initPoint: "https://mp/x", expiresInHours: 72 },
      { termsUrl: "https://www.fotfstudios.cl/terminos", whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(p.html).not.toContain("Hola:");
    expect(p.text).not.toContain("Hola:");
  });

  /**
   * Reserva manual "pendiente de pago": aviso al crearla (hasta acá el cliente no recibía
   * NADA antes de "se liberó tu hora") y recordatorio con ≤ 24 h para pagar. Los dos dicen
   * HASTA CUÁNDO pagar y traen los datos de transferencia (el link de MP no está activo:
   * sin botón de pago; el efectivo no se ofrece).
   */
  const pendingCtx = { termsUrl: "https://www.fotfstudios.cl/terminos", whatsappUrl: "https://wa.me/56962803298", transfer: TRANSFER };
  const PAY_BY = "viernes 9 de octubre, 09:00 h";
  describe.each([
    ["bookingHeldPending", bookingHeldPending],
    ["bookingPaymentReminder", bookingPaymentReminder],
  ] as const)("%s (reserva manual pendiente, sin link)", (name, tpl) => {
    const m = tpl({ name: "Ana", when: view.when, total: "$9.990", payBy: PAY_BY }, pendingCtx);

    it("dice cuándo, cuánto y que falta el pago", () => {
      expect(m.template).toBe(name);
      expect(m.subject).toMatch(/falta el pago/i);
      for (const body of [m.html, m.text]) {
        expect(body).toContain(view.when);
        expect(body).toContain("$9.990");
      }
    });

    it("dice hasta cuándo pagar y que si no, la reserva se anula", () => {
      expect(m.text).toContain(`Para confirmarla, paga antes del ${PAY_BY}. Si no recibimos el pago antes, la reserva se anula.`);
      expect(m.html).toContain(`paga antes del <strong>${PAY_BY}</strong>`);
      for (const body of [m.html, m.text]) {
        expect(body).toMatch(/la reserva se anula/);
      }
    });

    it("trae los datos de transferencia completos y a dónde mandar el comprobante", () => {
      for (const body of [m.html, m.text]) {
        for (const v of [TRANSFER.holder, TRANSFER.rut, TRANSFER.bank, TRANSFER.accountType, TRANSFER.accountNumber, TRANSFER.email]) {
          expect(body).toContain(v);
        }
        expect(body).toMatch(/comprobante/);
      }
      expect(m.html).toContain(`mailto:${TRANSFER.email}`);
    });

    /**
     * Los bancos chilenos "pegan datos" para agregar un destinatario: leen un bloque de
     * líneas \`Etiqueta: valor\`. Tiene que salir así al copiar, en HTML y en texto.
     */
    const PASTE_BLOCK = [
      `Nombre: ${TRANSFER.holder}`,
      `RUT: ${TRANSFER.rut}`,
      `Banco: ${TRANSFER.bank}`,
      `Tipo de cuenta: ${TRANSFER.accountType}`,
      `Número de cuenta: ${TRANSFER.accountNumber}`,
      `Correo: ${TRANSFER.email}`,
    ];

    it("texto: los datos van en un bloque de una línea por campo, listo para pegar en el banco", () => {
      expect(m.text).toContain(PASTE_BLOCK.join("\n"));
      expect(m.text).toMatch(/pégalos en tu banco/);
    });

    it("HTML: el bloque es UN solo elemento con <br>, sin estilos por campo (copia limpia)", () => {
      expect(m.html).toContain(PASTE_BLOCK.join("<br>"));
      expect(m.html).toMatch(/pégalos en tu banco/);
    });

    it("el monto va fuera del bloque (se pide al transferir, no al agregar el destinatario)", () => {
      expect(m.text).not.toContain(`${PASTE_BLOCK.at(-1)}\nMonto`);
      expect(m.text).toContain("Monto a transferir: $9.990");
      expect(m.html).toContain("Monto a transferir: <strong>$9.990</strong>");
    });

    it("no promete una confirmación que todavía no existe ni ofrece un link que no está activo", () => {
      expect(m.subject).not.toMatch(/confirmada/i);
      expect(m.html).not.toMatch(/Pagar ahora/);
      expect(m.text).not.toMatch(/link de pago/);
    });

    it("nunca ofrece efectivo (existe, pero solo como excepción del dueño)", () => {
      for (const body of [m.subject, m.html, m.text]) expect(body).not.toMatch(/efectivo/i);
    });

    it("trae los términos y el WhatsApp", () => {
      expect(m.html).toContain(pendingCtx.whatsappUrl);
      expect(m.html).toContain(pendingCtx.termsUrl);
    });

    it("sin nombre: no saluda con 'null' ni con 'Hola:'", () => {
      const p = tpl({ name: null, when: view.when, total: "$9.990", payBy: PAY_BY }, pendingCtx);
      expect(p.html).not.toContain("Hola:");
      expect(p.html).not.toContain("null");
      expect(p.text).not.toContain("null");
    });
  });

  it("el recordatorio no repite el asunto del aviso (no se enhebra como duplicado)", () => {
    const args = { name: "Ana", when: view.when, total: "$9.990", payBy: PAY_BY };
    expect(bookingPaymentReminder(args, pendingCtx).subject).not.toBe(bookingHeldPending(args, pendingCtx).subject);
  });
});

/**
 * Asuntos con la fecha de la sesión: Gmail agrupa por asunto idéntico y colapsa como
 * "texto citado" lo que se repite entre correos del mismo hilo (visto en el render check
 * en iPhone: "•••" y barra lateral). Con la fecha, cada sesión es su propio hilo — y el
 * asunto ya dice cuándo, sin abrir el correo.
 */
describe("asuntos de cliente con la fecha de la sesión", () => {
  const when = "martes 15 de septiembre, 09:00–10:00 h";
  const wa = "https://wa.me/56962803298";
  const place = { address: "Los Chercanes 78a", mapsUrl: MAPS };
  const cases: [string, () => string][] = [
    ["customerConfirmation", () => customerConfirmation({ ...view, when }, confCtx).subject],
    ["customerCourtesyConfirmation", () => customerCourtesyConfirmation({ name: null, when, addonNames: [] }, { ...place, whatsappUrl: wa, termsUrl: "t", privacyUrl: "p", links: { calendarUrl: "c", accountUrl: "a" } }).subject],
    ["customerAccessCode", () => customerAccessCode({ name: null, when, code: "123456" }, { ...place, whatsappUrl: wa }).subject],
    ["customerReminder", () => customerReminder({ name: null, when }, { ...place, whatsappUrl: wa, statusUrl: "s" }).subject],
    ["customerCancellation", () => customerCancellation({ name: null, when, refunded: null }, { whatsappUrl: wa }).subject],
    ["customerCourtesyCancelled", () => customerCourtesyCancelled({ name: null, when }, { whatsappUrl: wa }).subject],
    ["customerReschedule", () => customerReschedule({ name: null, when, refunded: null, refundedOffline: false }, { ...place, whatsappUrl: wa, calendarUrl: "c" }).subject],
    ["customerRescheduleFailed", () => customerRescheduleFailed({ name: null, when, refunded: "$1", kept: true }, { whatsappUrl: wa }).subject],
    ["customerHoldExpired", () => customerHoldExpired({ name: null, when }, { whatsappUrl: wa, bookUrl: "b" }).subject],
    ["customerPaymentNoSlot", () => customerPaymentNoSlot({ name: null, when, total: "$1" }, { whatsappUrl: wa }).subject],
    ["bookingPaymentPending", () => bookingPaymentPending({ name: null, when, total: "$1", initPoint: "i", expiresInHours: 72 }, { termsUrl: "t", whatsappUrl: wa }).subject],
    ["bookingHeldPending", () => bookingHeldPending({ name: null, when, total: "$1", payBy: "f" }, { termsUrl: "t", whatsappUrl: wa, transfer: TRANSFER }).subject],
    ["bookingPaymentReminder", () => bookingPaymentReminder({ name: null, when, total: "$1", payBy: "f" }, { termsUrl: "t", whatsappUrl: wa, transfer: TRANSFER }).subject],
  ];

  it.each(cases)("%s lleva la fecha en el asunto", (_name, subject) => {
    expect(subject()).toContain("martes 15 de septiembre");
  });

  it("dos sesiones distintas → dos asuntos distintos (no se enhebran)", () => {
    const a = customerConfirmation({ ...view, when }, confCtx).subject;
    const b = customerConfirmation({ ...view, when: "jueves 17 de septiembre, 18:00–20:00 h" }, confCtx).subject;
    expect(a).not.toBe(b);
  });
});

/**
 * FR2 (auditoría 2026-09-14): customerRescheduleFailed(`kept`) cambia de historia entera
 * cuando la reserva ya NO existe — decir "mantuvimos tu reserva" de una cancelada es falso.
 * Mismo `template` name en ambas ramas: el pin de nombres de plantilla sigue verde.
 */
describe("customerRescheduleFailed — kept distingue reserva viva de reserva cancelada", () => {
  const wa = "https://wa.me/56962803298";
  const when = "martes 15 de septiembre, 09:00–10:00 h";

  it("kept:true — copy de siempre: 'mantuvimos tu reserva del <when>'", () => {
    const m = customerRescheduleFailed({ name: "Ana", when, refunded: "$6.000", kept: true }, { whatsappUrl: wa });
    expect(m.template).toBe("customerRescheduleFailed");
    expect(m.subject).toBe(`No pudimos cambiar tu horario · se mantiene ${when}`);
    expect(m.html).toContain("No pudimos cambiar tu horario");
    expect(m.html).toContain("Mantuvimos tu reserva original del");
    expect(m.html).toContain(when);
    expect(m.text).toContain("Mantuvimos tu reserva del");
  });

  it("kept:false — 'Devolvimos el cobro del cambio de horario', sin mencionar que se mantiene nada", () => {
    const m = customerRescheduleFailed({ name: "Ana", when, refunded: "$6.000", kept: false }, { whatsappUrl: wa });
    expect(m.template).toBe("customerRescheduleFailed");
    expect(m.subject).toBe("Te devolvimos $6.000 · cambio de horario");
    expect(m.html).toContain("Devolvimos el cobro del cambio de horario");
    expect(m.html).toContain("ya estaba cancelada");
    expect(m.html).not.toContain("Mantuvimos tu reserva");
    expect(m.html).not.toContain(when);
    expect(m.text).not.toContain("Mantuvimos");
  });
});

describe("guideDelivery — la entrega de una guía", () => {
  const wa = "https://wa.me/56962803298";
  const url = "https://www.fotfstudios.cl/guia-dj/descarga/" + "a".repeat(48);
  const GUIDE_COPY = {
    templateKey: "guideDelivery:guia-dj",
    subject: "Tu Guía de iniciación al DJing (PDF)",
    preheader: "Tu Guía de iniciación al DJing, en PDF.",
    h1: "Acá está tu guía",
    blurb: "Guía de iniciación al DJing, 8 páginas en PDF.",
    ctaLabel: "Descargar la guía (PDF)",
    name: "Guía de iniciación al DJing",
  };
  const deliver = (downloadUrl = url, copy = GUIDE_COPY) => guideDelivery({ downloadUrl, copy }, { whatsappUrl: wa });

  it("asunto nombra la guía y el PDF; el link va como botón Y como texto en ambas versiones", () => {
    const m = deliver();
    expect(m.template).toBe("guideDelivery:guia-dj");
    expect(m.subject).toMatch(/gu[ií]a de iniciaci[óo]n al djing/i);
    expect(m.subject).toMatch(/pdf/i);
    expect(m.html).toContain(`href="${url}"`);
    expect(m.html).toContain(url); // también en claro, para copiar/pegar
    expect(m.text).toContain(url);
    expect(m.html).toMatch(/Descargar la gu[ií]a/);
  });

  it("dice que el link es durable (se puede volver a usar) y ofrece WhatsApp si algo falla", () => {
    const m = deliver();
    // Estructural, no por guía: el párrafo del link durable y la salida por WhatsApp
    // son iguales en todas.
    expect(m.html).toMatch(/link es tuyo|gu[áa]rdalo|vuelve a usar/i);
    expect(m.html).toContain(wa);
    expect(m.text).toContain(wa);
  });

  it("escapa la URL al incrustarla en HTML", () => {
    const m = deliver('https://x.example/?a=1&b="2"');
    expect(m.html).toContain("https://x.example/?a=1&amp;b=&quot;2&quot;");
    expect(m.html).not.toContain('b="2"');
  });

  it("no promete cupos, precios ni el curso: es solo la entrega de la guía", () => {
    const m = deliver();
    expect(m.html).not.toMatch(/\$|cupo|inscri|curso de dj/i);
  });

  it("el copy viene de la guía: otra guía produce otro asunto y otra clave de bitácora", () => {
    const otra = { ...GUIDE_COPY, templateKey: "guideDelivery:guia-mezcla", subject: "Tu guía de mezcla (PDF)", h1: "Acá está tu guía de mezcla" };
    const m = deliver(url, otra);
    expect(m.template).toBe("guideDelivery:guia-mezcla");
    expect(m.subject).toBe("Tu guía de mezcla (PDF)");
    expect(m.html).toContain("Acá está tu guía de mezcla");
  });

  const QUICK = [
    { lead: "¿Vas a comprar pronto?", body: "Ve directo al checklist." },
    { lead: "<b>¿Tienes fecha?</b>", body: "Lee el capítulo 06 & exporta." },
  ];

  it("sin quickStart no aparece el bloque \"Por dónde empezar\" (el correo de /guia-dj no cambia)", () => {
    const m = deliver();
    expect(m.html).not.toMatch(/Por d[óo]nde empezar/);
    expect(m.text).not.toMatch(/Por d[óo]nde empezar/);
  });

  it("con quickStart: bloque numerado 01, 02… en HTML y texto, con el copy escapado", () => {
    const m = deliver(url, { ...GUIDE_COPY, quickStart: QUICK });
    expect(m.html).toContain("Por dónde empezar");
    expect(m.html).toMatch(/>01<[\s\S]*¿Vas a comprar pronto\?[\s\S]*>02</);
    expect(m.html).not.toContain("<b>¿Tienes fecha?</b>");
    expect(m.html).toContain("&lt;b&gt;¿Tienes fecha?&lt;/b&gt;");
    expect(m.html).toContain("capítulo 06 &amp; exporta");
    expect(m.text).toContain("01 ¿Vas a comprar pronto? Ve directo al checklist.");
    expect(m.text).toContain("02 <b>¿Tienes fecha?</b> Lee el capítulo 06 & exporta.");
  });
});

describe("customerPointsBalance (saldo de puntos a pedido del admin)", () => {
  const ctx = {
    whatsappUrl: "https://wa.me/56962803298",
    bookUrl: "https://www.fotfstudios.cl/reservar",
    accountUrl: "https://www.fotfstudios.cl/cuenta",
  };
  const send = (name: string | null = "Ana") =>
    customerPointsBalance({ name, points: "3.398", value: "$3.398" }, ctx);

  it("el saldo va en el asunto y en el cuerpo", () => {
    const m = send();
    expect(m.subject).toBe("Tienes 3.398 puntos FOTF");
    expect(m.html).toContain("Tienes 3.398 puntos");
    expect(m.text).toContain("3.398 puntos");
  });

  it("dice a cuánto equivalen en pesos (1 punto = $1)", () => {
    const m = send();
    expect(m.html).toContain("$3.398");
    expect(m.text).toContain("$3.398");
  });

  it("lleva los tres enlaces: reservar, la cuenta y WhatsApp", () => {
    const m = send();
    expect(m.html).toContain('href="https://www.fotfstudios.cl/reservar"');
    expect(m.html).toContain('href="https://www.fotfstudios.cl/cuenta"');
    expect(m.html).toContain(ctx.whatsappUrl);
    expect(m.text).toContain(ctx.bookUrl);
    expect(m.text).toContain(ctx.accountUrl);
  });

  it("saluda por el nombre, y sin nombre arranca en mayúscula", () => {
    expect(send().html).toContain("Hola Ana, tus Puntos FOTF");
    expect(send(null).html).toContain("Tus Puntos FOTF");
    expect(send(null).html).not.toContain("Hola");
  });

  it("escapa el nombre del cliente", () => {
    const m = customerPointsBalance({ name: '<b>Ana</b>', points: "10", value: "$10" }, ctx);
    expect(m.html).not.toContain("<b>Ana</b>");
    expect(m.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
  });

  // No cuelga de una sesión: sin fecha, sin dirección, sin PIN. Y sin Sirena —
  // un saldo no es una urgencia (Manual de Marca).
  it("no habla de una sesión concreta ni usa Sirena", () => {
    const m = send();
    expect(m.html).not.toMatch(/reserva confirmada|c[óo]digo de acceso|Los Chercanes/i);
    expect(m.html).not.toContain("#ff4d1d");
  });
});

describe("pedido de reseña en Google", () => {
  const REVIEW = "https://search.google.com/local/writereview?placeid=ChIJS9a2LkfdiZYR2ta5v8a8utw";
  const m = courseReviewRequest({ name: "Martín <b>" }, { reviewUrl: REVIEW, whatsappUrl: "https://wa.me/56962803298" });

  it("un botón al formulario de reseña, también en texto plano", () => {
    expect(m.template).toBe("courseReviewRequest");
    expect(m.html).toContain(`href="${REVIEW}"`);
    expect(m.text).toContain(REVIEW);
  });

  it("escapa el nombre y deja salida por WhatsApp para quejas", () => {
    expect(m.html).toContain("Martín &lt;b&gt;");
    expect(m.html).not.toContain("Martín <b>");
    expect(m.html).toContain("https://wa.me/56962803298");
  });

  it("no ofrece nada a cambio (política de reseñas de Google)", () => {
    expect(m.html + m.text).not.toMatch(/descuento|gratis|regalo|sorteo|premio/i);
  });
});

/**
 * Curso 1:1: cada alumno tiene su propio programa. El correo al alumno nunca habla
 * de "generación" ni de "cupos" ni ofrece "la siguiente" — eso era la cohorte.
 */
describe("correos del curso 1:1 — sin vocabulario de cohorte", () => {
  const WA = { whatsappUrl: "https://wa.me/56962803298" };
  const COHORTE = /generaci|cupo|siguiente/i;
  const PLACE = { address: "Viña del Mar", mapsUrl: "https://maps.example", ...WA };

  it("pagado: 'Tu curso está confirmado', sesiones y las 6 horas de práctica", () => {
    const m = courseEnrollmentPaid(
      { name: "Martín", generation: "P0001", total: "$249.990", sessions: ["jueves 8 de octubre, 16:00–17:30 h"] },
      PLACE,
    );
    expect(m.subject).toBe("Tu curso está confirmado — Curso de DJ");
    expect(m.html).toContain("Tu curso está confirmado");
    expect(m.html).toContain("jueves 8 de octubre, 16:00–17:30 h");
    expect(m.html).toContain("6 horas de práctica libre");
    expect(m.text).toContain("6 horas de práctica libre");
    expect(m.html).not.toMatch(COHORTE);
    expect(m.text).not.toMatch(COHORTE);
  });

  it("pagado sin fechas: promete coordinarlas por WhatsApp", () => {
    const m = courseEnrollmentPaid({ name: "Martín", generation: "P0001", total: "$249.990", sessions: [] }, PLACE);
    expect(m.html).toMatch(/fechas de tus 6 sesiones/);
  });

  it("link de pago: 'Tu curso te espera', sin cupos", () => {
    const m = courseEnrollmentPending(
      { name: "Martín", generation: "P0001", total: "$249.990", initPoint: "https://mp.example/p", expiresInHours: 72 },
      { termsUrl: "https://fotfstudios.cl/terminos", ...WA },
    );
    expect(m.html).toContain("Tu curso te espera");
    expect(m.subject).not.toMatch(COHORTE);
    expect(m.html).not.toMatch(COHORTE);
    expect(m.text).not.toMatch(COHORTE);
  });

  it("anulada (impaga): sin cupos ni 'la siguiente'", () => {
    const m = courseEnrollmentCancelled({ name: "Martín", generation: "P0001" }, WA);
    expect(m.html).toContain("No se hizo ningún cobro");
    expect(m.html).not.toMatch(COHORTE);
    expect(m.text).not.toMatch(COHORTE);
  });

  it("cancelada (pagada): sin cupos ni 'la siguiente generación'", () => {
    const m = courseEnrollmentRefunded({ name: "Martín", generation: "P0001", refunded: "$249.990" }, WA);
    expect(m.html).not.toMatch(COHORTE);
    expect(m.text).not.toMatch(COHORTE);
  });

  it("aviso al dueño de solicitud: sin conteo de cupos", () => {
    const m = ownerNewCourseLead({
      name: "Martín", email: "m@e.cl", phone: "+56911111111", plan: "individual",
      experience: "cero", availability: "Tardes", message: null,
    });
    expect(m.html).not.toMatch(/cupo|generaci/i);
    expect(m.text).not.toMatch(/cupo|generaci/i);
  });

  it("aviso al dueño de pago: código del programa y sin conteo de cupos", () => {
    const m = ownerCoursePaid({ name: "Martín", generation: "P0001", total: "$249.990", method: "transferencia" });
    expect(m.subject).toContain("P0001");
    expect(m.html).toContain("Recuerda emitir la boleta");
    expect(m.html).not.toMatch(/cupo|generaci/i);
    expect(m.text).not.toMatch(/cupo|generaci/i);
  });
});

describe("recordatorio de una sesión guiada del curso", () => {
  const CTX = {
    address: "Viña del Mar", mapsUrl: "https://maps.example", whatsappUrl: "https://wa.me/56962803298",
    courseUrl: "https://fotfstudios.cl/cuenta/curso",
  };
  const m = courseSessionReminder(
    { name: "Martín", when: "jueves 8 de octubre, 16:00–17:30 h", n: 3, title: "Frases y mezcla larga", instructor: "Benja" },
    CTX,
  );

  it("dice qué sesión es, cuándo y quién la dicta", () => {
    expect(m.template).toBe("courseSessionReminder");
    expect(m.subject).toBe("Tu sesión 3 del curso se acerca · jueves 8 de octubre, 16:00–17:30 h");
    expect(m.html).toContain("Sesión 3 · Frases y mezcla larga");
    expect(m.html).toContain("Benja te espera en la sala");
    expect(m.text).toContain("Sesión 3 · Frases y mezcla larga");
  });

  it("es guiada: no promete PIN, dice que lo reciben en la puerta, y el aviso de 24 h", () => {
    expect(m.html + m.text).not.toMatch(/entras solo|sin esperar a nadie/i);
    expect(m.html + m.text).not.toMatch(/código de acceso|PIN/);
    expect(m.html).toContain("te recibimos en la puerta");
    expect(m.text).toContain("te recibimos en la puerta");
    expect(m.html).toMatch(/24 horas/);
    expect(m.html).toContain("https://fotfstudios.cl/cuenta/curso");
  });

  it("sin instructor asignado no inventa uno", () => {
    const sin = courseSessionReminder({ name: "Martín", when: "x", n: 1, title: "Sonido", instructor: null }, CTX);
    expect(sin.html).not.toContain("te espera en la sala");
  });

  it("escapa el título y el nombre (anti-XSS)", () => {
    const x = courseSessionReminder({ name: "<b>M</b>", when: "x", n: 1, title: "<i>T</i>", instructor: "<u>I</u>" }, CTX);
    expect(x.html).not.toContain("<i>T</i>");
    expect(x.html).not.toContain("<u>I</u>");
    expect(x.html).not.toContain("<b>M</b>");
  });
});

describe("pago duplicado (aviso al dueño)", () => {
  const m = ownerDuplicatePayment({
    when: "jueves 8 de octubre, 16:00–17:00 h",
    email: "<b>ana@e.cl</b>",
    paymentId: "mp_999",
    amount: "$9.990",
    storedMethod: "Transferencia",
  });

  it("dice qué devolver, desde dónde, y cómo estaba pagada", () => {
    expect(m.template).toBe("ownerDuplicatePayment");
    expect(m.subject).toContain("Pago duplicado");
    expect(m.html).toContain("ya estaba pagada por Transferencia");
    expect(m.html).toContain("#mp_999");
    expect(m.html).toMatch(/panel de Mercado Pago/);
    expect(m.text).toContain("mp_999");
  });

  it("escapa el email (anti-XSS) y tolera método desconocido", () => {
    expect(m.html).not.toContain("<b>ana@e.cl</b>");
    const sin = ownerDuplicatePayment({ when: "x", email: null, paymentId: "1", amount: "$1", storedMethod: null });
    expect(sin.html).toContain("ya estaba pagada</strong>");
    expect(sin.html).toContain("sin email");
  });
});
