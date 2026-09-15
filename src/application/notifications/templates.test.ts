import { describe, expect, it } from "vitest";
import { applicantConfirmation, bookingPaymentPending, courseEnrollmentRefunded, customerCourtesyCancelled, customerHoldExpired, customerPaymentNoSlot, customerReminder, customerReschedule, customerRescheduleFailed, customerAccessCode, customerCancellation, customerConfirmation, customerCourtesyConfirmation, ownerNewApplication, ownerNotification } from "./templates";

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
    expect(m.html).toContain("G3");
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
    expect(m.html).toContain("G3");
  });

  it("escapa nombre y generación (anti-XSS)", () => {
    const m = courseEnrollmentRefunded(
      { name: "<b>Ana</b>", generation: "<i>G3</i>", refunded: null },
      { whatsappUrl: "https://wa.me/56962803298" },
    );
    expect(m.html).not.toContain("<b>Ana</b>");
    expect(m.html).not.toContain("<i>G3</i>");
    expect(m.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
  });
});

describe("bitácora: cada plantilla se identifica con su propio nombre", () => {
  it("customerConfirmation lleva template = 'customerConfirmation'", () => {
    const m = customerConfirmation(view, confCtx);
    expect(m.template).toBe("customerConfirmation");
  });

  it("toda función exportada de templates.ts devuelve template con su nombre", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./templates.ts", import.meta.url), "utf8");
    const names = [...src.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      expect(src, `${name} sin template`).toContain(`template: "${name}"`);
    }
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
    ["customerRescheduleFailed", () => customerRescheduleFailed({ name: null, when, refunded: "$1" }, { whatsappUrl: wa }).subject],
    ["customerHoldExpired", () => customerHoldExpired({ name: null, when }, { whatsappUrl: wa, bookUrl: "b" }).subject],
    ["customerPaymentNoSlot", () => customerPaymentNoSlot({ name: null, when, total: "$1" }, { whatsappUrl: wa }).subject],
    ["bookingPaymentPending", () => bookingPaymentPending({ name: null, when, total: "$1", initPoint: "i", expiresInHours: 72 }, { termsUrl: "t", whatsappUrl: wa }).subject],
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
