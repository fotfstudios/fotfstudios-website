import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  decideOutcome,
  googleEventId,
  toGoogleEvent,
  type ReservationSnapshot,
} from "./google-event";

const ID = "8c912855-199d-4e97-a1c4-52cb6a7c26e1";
const SITE = "https://www.fotfstudios.cl";

/** Reserva base: domingo 12 jul 2026 18:00–20:00 en Santiago (invierno, UTC−4). */
function snap(over: Partial<ReservationSnapshot> = {}): ReservationSnapshot {
  return {
    id: ID,
    kind: "booking",
    status: "confirmed",
    startsAt: "2026-07-12T22:00:00+00:00",
    endsAt: "2026-07-13T00:00:00+00:00",
    expiresAt: null,
    customerName: "Martín Pérez",
    notes: null,
    orderId: "0b1c2d3e-0000-4000-8000-000000000001",
    rescheduleId: null,
    course: null,
    addons: [],
    tz: "America/Santiago",
    ...over,
  };
}

describe("googleEventId", () => {
  it("es 'fotf' + el hex del uuid: base32hex (a-v, 0-9) y 5–1024 caracteres, como exige Google", () => {
    const id = googleEventId(ID);
    expect(id).toBe("fotf8c912855199d4e97a1c452cb6a7c26e1");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it("es estable y no distingue mayúsculas (la misma reserva siempre apunta al mismo evento)", () => {
    expect(googleEventId(ID.toUpperCase())).toBe(googleEventId(ID));
  });

  it("rechaza algo que no es un uuid (un id inválido haría que Google genere uno propio y se pierda el vínculo)", () => {
    expect(() => googleEventId("no-es-uuid")).toThrow();
  });
});

describe("decideOutcome", () => {
  const now = new Date("2026-07-10T12:00:00Z");

  it("borra cuando la reserva ya no existe (bloqueo borrado, hold de reagendamiento liberado)", () => {
    expect(decideOutcome(null, now)).toBe("delete");
  });

  it.each(["cancelled", "expired"] as const)("borra una reserva %s", (status) => {
    expect(decideOutcome(snap({ status }), now)).toBe("delete");
  });

  it("borra un hold cuyo vencimiento ya pasó (no crea un tentativo que vive 60 segundos)", () => {
    expect(decideOutcome(snap({ status: "held", expiresAt: "2026-07-10T11:59:00Z" }), now)).toBe("delete");
  });

  it("publica un hold vigente y un hold firme (sin vencimiento)", () => {
    expect(decideOutcome(snap({ status: "held", expiresAt: "2026-07-10T12:10:00Z" }), now)).toBe("upsert");
    expect(decideOutcome(snap({ status: "held", expiresAt: null }), now)).toBe("upsert");
  });

  it("NO borra lo pasado: la agenda vieja queda como historial", () => {
    expect(decideOutcome(snap({ startsAt: "2020-01-01T12:00:00Z", endsAt: "2020-01-01T14:00:00Z" }), now)).toBe("upsert");
  });
});

describe("toGoogleEvent — títulos", () => {
  it("reserva confirmada: sala, nombre y horas", () => {
    const e = toGoogleEvent(snap(), { siteUrl: SITE });
    expect(e.summary).toBe("Sala · Martín Pérez · 2h");
    expect(e.status).toBe("confirmed");
  });

  it("sin nombre dice 'Reserva'; horas fraccionarias con coma", () => {
    const e = toGoogleEvent(snap({ customerName: null, endsAt: "2026-07-12T23:30:00+00:00" }), { siteUrl: SITE });
    expect(e.summary).toBe("Sala · Reserva · 1,5h");
  });

  it("hold: tentativo y marcado pendiente de pago", () => {
    const e = toGoogleEvent(snap({ status: "held" }), { siteUrl: SITE });
    expect(e.summary).toBe("Sala · Martín Pérez · 2h (pendiente de pago)");
    expect(e.status).toBe("tentative");
  });

  it("hold de un reagendamiento: lo dice, para no confundirlo con una reserva nueva", () => {
    const e = toGoogleEvent(snap({ status: "held", rescheduleId: "11111111-1111-4111-8111-111111111111" }), { siteUrl: SITE });
    expect(e.summary).toBe("Sala · Martín Pérez · 2h (reagendamiento pendiente de pago)");
  });

  it("sesión de curso: generación, número y título", () => {
    const e = toGoogleEvent(
      snap({ kind: "curso", customerName: null, orderId: null, course: { n: 3, title: "Beatmatching", sessionStatus: "agendada", generationName: "Generación 2" } }),
      { siteUrl: SITE },
    );
    expect(e.summary).toBe("Curso DJ · Generación 2 · Sesión 3: Beatmatching");
  });

  it("sesión de curso sin su fila de sesión: cae a la nota que escribe schedule_course_generation", () => {
    const e = toGoogleEvent(snap({ kind: "curso", notes: "Curso G02 · Sesión 3" }), { siteUrl: SITE });
    expect(e.summary).toBe("Curso G02 · Sesión 3");
  });

  it("bloqueo: 'Bloqueo', con el motivo si lo hay", () => {
    expect(toGoogleEvent(snap({ kind: "block", customerName: null, orderId: null }), { siteUrl: SITE }).summary).toBe("Bloqueo");
    expect(toGoogleEvent(snap({ kind: "block", notes: "mantención" }), { siteUrl: SITE }).summary).toBe("Bloqueo · mantención");
  });
});

describe("toGoogleEvent — descripción", () => {
  it("lleva el link a la ficha, el pedido y los extras", () => {
    const e = toGoogleEvent(snap({ addons: ["Grabación audio + video"] }), { siteUrl: SITE });
    expect(e.description).toContain(`${SITE}/admin/reservas/${ID}`);
    expect(e.description).toContain("Pedido: 0b1c2d3e-0000-4000-8000-000000000001");
    expect(e.description).toContain("Extras: Grabación audio + video");
  });

  it("NO lleva las notas de una reserva de cliente (texto libre: pueden traer datos personales)", () => {
    const e = toGoogleEvent(snap({ notes: "cliente pidió llamar al +56 9 1234 5678" }), { siteUrl: SITE });
    expect(e.description).not.toContain("1234");
    expect(e.description).not.toContain("Notas");
  });

  it.each(["block", "curso"] as const)("SÍ lleva las notas de un %s", (kind) => {
    const e = toGoogleEvent(snap({ kind, notes: "traer cables" }), { siteUrl: SITE });
    expect(e.description).toContain("Notas: traer cables");
  });

  it("guarda el vínculo en extendedProperties privadas", () => {
    const e = toGoogleEvent(snap(), { siteUrl: SITE });
    expect(e.extendedProperties.private).toEqual({ reservationId: ID, kind: "booking", status: "confirmed" });
  });
});

describe("toGoogleEvent — hora", () => {
  it("invierno (UTC−4): 18:00 local con el offset correcto y la zona del estudio", () => {
    const e = toGoogleEvent(snap(), { siteUrl: SITE });
    expect(e.start).toEqual({ dateTime: "2026-07-12T18:00:00.000-04:00", timeZone: "America/Santiago" });
    expect(e.end.dateTime).toBe("2026-07-12T20:00:00.000-04:00");
  });

  it("verano (UTC−3): mismo instante almacenado, otro offset", () => {
    const e = toGoogleEvent(snap({ startsAt: "2026-01-10T21:00:00Z", endsAt: "2026-01-10T23:00:00Z" }), { siteUrl: SITE });
    expect(e.start.dateTime).toBe("2026-01-10T18:00:00.000-03:00");
  });
});

describe("toGoogleEvent — presentación", () => {
  it("colores por tipo: curso, bloqueo y hold se distinguen; la reserva confirmada usa el del calendario", () => {
    expect(toGoogleEvent(snap(), { siteUrl: SITE }).colorId).toBeUndefined();
    expect(toGoogleEvent(snap({ kind: "curso" }), { siteUrl: SITE }).colorId).toBe("9");
    expect(toGoogleEvent(snap({ kind: "block" }), { siteUrl: SITE }).colorId).toBe("8");
    expect(toGoogleEvent(snap({ status: "held" }), { siteUrl: SITE }).colorId).toBe("5");
  });

  it("holds y bloqueos no suenan; el resto usa los recordatorios por defecto del calendario", () => {
    expect(toGoogleEvent(snap({ status: "held" }), { siteUrl: SITE }).reminders).toEqual({ useDefault: false, overrides: [] });
    expect(toGoogleEvent(snap({ kind: "block" }), { siteUrl: SITE }).reminders).toEqual({ useDefault: false, overrides: [] });
    expect(toGoogleEvent(snap(), { siteUrl: SITE }).reminders).toEqual({ useDefault: true });
  });

  it("nunca invita a nadie (una cuenta de servicio no puede, y el cliente no debe recibir nada de Google)", () => {
    expect(toGoogleEvent(snap(), { siteUrl: SITE })).not.toHaveProperty("attendees");
  });
});

describe("canonicalJson", () => {
  it("no depende del orden de las claves (el fingerprint no cambia por cómo se armó el objeto)", () => {
    const a = toGoogleEvent(snap(), { siteUrl: SITE });
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as typeof a;
    expect(canonicalJson(reordered)).toBe(canonicalJson(a));
  });

  it("cambia cuando cambia el evento", () => {
    const a = toGoogleEvent(snap(), { siteUrl: SITE });
    const b = toGoogleEvent(snap({ customerName: "Otra" }), { siteUrl: SITE });
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });
});
