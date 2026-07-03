import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl, type IcsEvent } from "./ics";

const EVENT: IcsEvent = {
  start: "2026-07-09T18:00:00-04:00",
  end: "2026-07-09T20:00:00-04:00",
  summary: "FOTF Studios — Sala",
  description: "Coordinaremos tu acceso por WhatsApp antes de tu sesión.",
  location: "Los Chercanes 78a, Viña del Mar, Valparaíso",
  uid: "fotf-abc123@fotfstudios.cl",
  url: "https://www.fotfstudios.cl/reserva/estado?b=abc123",
};

const DTSTAMP = new Date("2026-07-03T12:00:00Z");

describe("buildIcs", () => {
  it("convierte DTSTART/DTEND a UTC (Z) desde ISO con offset -04:00", () => {
    const ics = buildIcs(EVENT, { dtstamp: DTSTAMP });
    expect(ics).toContain("DTSTART:20260709T220000Z");
    expect(ics).toContain("DTEND:20260710T000000Z");
  });

  it("es determinista: mismos inputs → mismo output, con DTSTAMP inyectado", () => {
    const a = buildIcs(EVENT, { dtstamp: DTSTAMP });
    const b = buildIcs(EVENT, { dtstamp: DTSTAMP });
    expect(a).toBe(b);
    expect(a).toContain("DTSTAMP:20260703T120000Z");
  });

  it("incluye las líneas fijas del calendario y el UID dado", () => {
    const ics = buildIcs(EVENT, { dtstamp: DTSTAMP });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//FOTF Studios//Reservas//ES");
    expect(ics).toContain("UID:fotf-abc123@fotfstudios.cl");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("usa CRLF en todos los saltos de línea (ningún \\n suelto)", () => {
    const ics = buildIcs(EVENT, { dtstamp: DTSTAMP });
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(ics).toContain("\r\n");
  });

  it("escapa coma, punto y coma, backslash y saltos de línea en campos TEXT", () => {
    const ics = buildIcs(
      {
        ...EVENT,
        summary: "A;B",
        description: "línea1\nlínea2, con coma; y \\barra",
        location: "Calle 1, Viña",
      },
      { dtstamp: DTSTAMP },
    );
    expect(ics).toContain("SUMMARY:A\\;B");
    expect(ics).toContain("línea1\\nlínea2\\, con coma\\; y \\\\barra");
    expect(ics).toContain("LOCATION:Calle 1\\, Viña");
  });

  it("pliega líneas largas con CRLF + espacio (continuación)", () => {
    const ics = buildIcs(
      { ...EVENT, description: "x".repeat(200) },
      { dtstamp: DTSTAMP },
    );
    const lines = ics.split("\r\n");
    // Ninguna línea supera 75 octetos y existe al menos una continuación.
    expect(lines.every((l) => Buffer.byteLength(l, "utf8") <= 75)).toBe(true);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
    // El contenido desplegado conserva los 200 caracteres.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("x".repeat(200));
  });

  it("omite DESCRIPTION/LOCATION/URL cuando no vienen", () => {
    const ics = buildIcs(
      { start: EVENT.start, end: EVENT.end, summary: "S", uid: "u@x" },
      { dtstamp: DTSTAMP },
    );
    expect(ics).not.toContain("DESCRIPTION");
    expect(ics).not.toContain("LOCATION");
    expect(ics).not.toContain("URL");
  });
});

describe("googleCalendarUrl", () => {
  it("arma la URL TEMPLATE con fechas UTC y params codificados", () => {
    const url = new URL(googleCalendarUrl(EVENT));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("FOTF Studios — Sala");
    expect(url.searchParams.get("dates")).toBe("20260709T220000Z/20260710T000000Z");
    expect(url.searchParams.get("location")).toBe("Los Chercanes 78a, Viña del Mar, Valparaíso");
    expect(url.searchParams.get("details")).toContain("WhatsApp");
  });

  it("omite details/location ausentes", () => {
    const url = new URL(
      googleCalendarUrl({ start: EVENT.start, end: EVENT.end, summary: "S" }),
    );
    expect(url.searchParams.has("details")).toBe(false);
    expect(url.searchParams.has("location")).toBe(false);
  });
});
