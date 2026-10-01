import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { CalendarSyncError } from "@/src/application/ports/calendar";
import type { GoogleEventPayload } from "@/src/domain/calendar/google-event";
import { GoogleCalendarClient, TokenCache } from "./google-calendar";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const EMAIL = "espejo@fotf-cal.iam.gserviceaccount.com";
const CAL = "abc123@group.calendar.google.com";
const EVENT = "fotf8c912855199d4e97a1c452cb6a7c26e1";
const EVENTS = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL)}/events`;

const payload: GoogleEventPayload = {
  summary: "Sala · Martín · 2h",
  description: "Ficha: x",
  start: { dateTime: "2026-07-12T18:00:00.000-04:00", timeZone: "America/Santiago" },
  end: { dateTime: "2026-07-12T20:00:00.000-04:00", timeZone: "America/Santiago" },
  status: "confirmed",
  reminders: { useDefault: true },
  extendedProperties: { private: { reservationId: "r", kind: "booking", status: "confirmed" } },
};

type Call = { method: string; url: string; body: string | undefined; auth: string | null };
type Reply = { status: number; json?: unknown };

/** fetch falso: registra cada llamada y responde según el guion, en orden, por "MÉTODO url". */
function fakeFetch(script: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ method, url, body: init?.body as string | undefined, auth: headers.get("authorization") });
    const key = url.startsWith("https://oauth2.googleapis.com/token") ? "TOKEN" : `${method} ${url}`;
    const queue = script[key];
    const reply = queue?.shift();
    if (!reply) throw new Error(`fetch inesperado: ${key}`);
    return new Response(reply.json === undefined ? null : JSON.stringify(reply.json), { status: reply.status });
  }) as typeof fetch;
  return { fn, calls };
}

const token = (n = 1): Reply[] => Array.from({ length: n }, (_, i) => ({ status: 200, json: { access_token: `tok${i + 1}`, expires_in: 3600 } }));
const googleError = (status: number, reason: string, message = reason): Reply => ({
  status,
  json: { error: { code: status, message, errors: [{ reason, message }] } },
});

let cache: TokenCache;
beforeEach(() => {
  cache = new TokenCache();
});

function client(fetchFn: typeof fetch, over: Partial<{ privateKey: string; now: () => number }> = {}) {
  return new GoogleCalendarClient({ clientEmail: EMAIL, privateKey: PEM, calendarId: CAL, fetch: fetchFn, cache, ...over });
}

describe("token de la cuenta de servicio", () => {
  it("firma un JWT RS256 válido con iss, scope y aud de Google", async () => {
    const f = fakeFetch({ TOKEN: token(), [`PATCH ${EVENTS}/${EVENT}`]: [{ status: 200, json: {} }] });
    await client(f.fn).upsertEvent(EVENT, payload);

    const form = new URLSearchParams(f.calls[0].body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [h, c, s] = form.get("assertion")!.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toMatchObject({
      iss: EMAIL,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("acepta la llave con los saltos escapados (\\n literal, como queda al pegarla en un dashboard)", async () => {
    const f = fakeFetch({ TOKEN: token(), [`PATCH ${EVENTS}/${EVENT}`]: [{ status: 200, json: {} }] });
    await client(f.fn, { privateKey: PEM.replace(/\n/g, "\\n") }).upsertEvent(EVENT, payload);
    expect(f.calls[1].auth).toBe("Bearer tok1");
  });

  it("reusa el token entre llamadas y entre instancias (cache de módulo: Fluid Compute mantiene la instancia viva)", async () => {
    const f = fakeFetch({ TOKEN: token(), [`PATCH ${EVENTS}/${EVENT}`]: [{ status: 200 }, { status: 200 }] });
    await client(f.fn).upsertEvent(EVENT, payload);
    await client(f.fn).upsertEvent(EVENT, payload);
    expect(f.calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
  });

  it("dos llamadas concurrentes piden UN solo token", async () => {
    const f = fakeFetch({ TOKEN: token(), [`PATCH ${EVENTS}/${EVENT}`]: [{ status: 200 }, { status: 200 }] });
    const c = client(f.fn);
    await Promise.all([c.upsertEvent(EVENT, payload), c.upsertEvent(EVENT, payload)]);
    expect(f.calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
  });

  it("renueva el token un minuto antes de que venza", async () => {
    let now = 1_000_000;
    const f = fakeFetch({ TOKEN: token(2), [`PATCH ${EVENTS}/${EVENT}`]: [{ status: 200 }, { status: 200 }] });
    const c = client(f.fn, { now: () => now });
    await c.upsertEvent(EVENT, payload);
    now += (3600 - 59) * 1000;
    await c.upsertEvent(EVENT, payload);
    expect(f.calls[3].auth).toBe("Bearer tok2");
  });

  it("ante un 401 descarta el token y reintenta UNA vez", async () => {
    const f = fakeFetch({ TOKEN: token(2), [`PATCH ${EVENTS}/${EVENT}`]: [{ status: 401 }, { status: 200 }] });
    await client(f.fn).upsertEvent(EVENT, payload);
    expect(f.calls.map((c) => c.auth ?? "token")).toEqual(["token", "Bearer tok1", "token", "Bearer tok2"]);
  });

  it("un invalid_grant (llave revocada, reloj corrido) no es reintentable", async () => {
    const f = fakeFetch({ TOKEN: [{ status: 400, json: { error: "invalid_grant", error_description: "Invalid JWT Signature." } }] });
    const err = await client(f.fn).upsertEvent(EVENT, payload).catch((e) => e);
    expect(err).toBeInstanceOf(CalendarSyncError);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("Invalid JWT Signature");
  });

  it("una llave que no es PEM falla claro y sin red", async () => {
    const f = fakeFetch({});
    const err = await client(f.fn, { privateKey: "no-es-una-llave" }).upsertEvent(EVENT, payload).catch((e) => e);
    expect(err).toBeInstanceOf(CalendarSyncError);
    expect(err.retryable).toBe(false);
    expect(f.calls).toHaveLength(0);
  });
});

describe("upsertEvent", () => {
  it("PATCH al evento con el payload completo", async () => {
    const f = fakeFetch({ TOKEN: token(), [`PATCH ${EVENTS}/${EVENT}`]: [{ status: 200 }] });
    await client(f.fn).upsertEvent(EVENT, payload);
    expect(JSON.parse(f.calls[1].body!)).toEqual(payload);
  });

  it("si no existe (404), lo inserta con el id derivado", async () => {
    const f = fakeFetch({
      TOKEN: token(),
      [`PATCH ${EVENTS}/${EVENT}`]: [googleError(404, "notFound")],
      [`POST ${EVENTS}`]: [{ status: 200 }],
    });
    await client(f.fn).upsertEvent(EVENT, payload);
    expect(JSON.parse(f.calls[2].body!)).toEqual({ id: EVENT, ...payload });
  });

  it("si el insert choca (409: el id ya se usó, p. ej. un evento borrado a mano), vuelve a hacer PATCH", async () => {
    const f = fakeFetch({
      TOKEN: token(),
      [`PATCH ${EVENTS}/${EVENT}`]: [googleError(404, "notFound"), { status: 200 }],
      [`POST ${EVENTS}`]: [googleError(409, "duplicate")],
    });
    await client(f.fn).upsertEvent(EVENT, payload);
    expect(f.calls.map((c) => c.method)).toEqual(["POST", "PATCH", "POST", "PATCH"]);
  });

  it("404 también en el insert = el calendario no existe o no está compartido: no reintentable", async () => {
    const f = fakeFetch({
      TOKEN: token(),
      [`PATCH ${EVENTS}/${EVENT}`]: [googleError(404, "notFound")],
      [`POST ${EVENTS}`]: [googleError(404, "notFound", "Not Found")],
    });
    const err = await client(f.fn).upsertEvent(EVENT, payload).catch((e) => e);
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(404);
  });

  it.each([
    ["429", googleError(429, "rateLimitExceeded")],
    ["503", googleError(503, "backendError")],
    ["403 de cuota", googleError(403, "userRateLimitExceeded")],
  ])("%s es reintentable", async (_label, reply) => {
    const f = fakeFetch({ TOKEN: token(), [`PATCH ${EVENTS}/${EVENT}`]: [reply] });
    const err = await client(f.fn).upsertEvent(EVENT, payload).catch((e) => e);
    expect(err).toBeInstanceOf(CalendarSyncError);
    expect(err.retryable).toBe(true);
  });

  it.each([
    ["403 sin permiso (calendario no compartido)", googleError(403, "requiredAccessLevel", "You need to have writer access to this calendar.")],
    ["400", googleError(400, "invalid", "Invalid start time.")],
  ])("%s no es reintentable y conserva el mensaje de Google", async (_label, reply) => {
    const f = fakeFetch({ TOKEN: token(), [`PATCH ${EVENTS}/${EVENT}`]: [reply] });
    const err = await client(f.fn).upsertEvent(EVENT, payload).catch((e) => e);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain((reply.json as { error: { message: string } }).error.message);
  });

  it("un error de red es reintentable", async () => {
    let first = true;
    const fn = (async (input: string | URL | Request) => {
      if (String(input).includes("oauth2") && first) {
        first = false;
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await client(fn).upsertEvent(EVENT, payload).catch((e) => e);
    expect(err).toBeInstanceOf(CalendarSyncError);
    expect(err.retryable).toBe(true);
  });
});

describe("deleteEvent", () => {
  it.each([204, 404, 410])("DELETE con %i es éxito (ya no está = lo que queríamos)", async (status) => {
    const f = fakeFetch({ TOKEN: token(), [`DELETE ${EVENTS}/${EVENT}`]: [{ status }] });
    await expect(client(f.fn).deleteEvent(EVENT)).resolves.toBeUndefined();
  });

  it("un 500 al borrar es reintentable", async () => {
    const f = fakeFetch({ TOKEN: token(), [`DELETE ${EVENTS}/${EVENT}`]: [googleError(500, "backendError")] });
    const err = await client(f.fn).deleteEvent(EVENT).catch((e) => e);
    expect(err.retryable).toBe(true);
  });
});
