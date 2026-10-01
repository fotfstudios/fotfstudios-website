/**
 * Adaptador de Google Calendar (API v3) con una cuenta de servicio. Único lugar que conoce
 * la API de Google; el resto de la app habla con el puerto `CalendarSync`.
 *
 * Sin SDK ni dependencias nuevas: el JWT RS256 se firma con `node:crypto` y las llamadas van
 * por `fetch` (inyectable: así lo prueban los tests, sin red).
 *
 * El dueño comparte UN calendario con el email de la cuenta de servicio ("Hacer cambios en
 * eventos"); no hace falta delegación de dominio ni OAuth de usuario.
 */
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { CalendarSyncError, type CalendarSync } from "@/src/application/ports/calendar";
import type { GoogleEventPayload } from "@/src/domain/calendar/google-event";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** Renovar un minuto antes: un token que vence en vuelo daría un 401 evitable. */
const REFRESH_MARGIN_MS = 60_000;
/** Motivos de 403 que son cuota (transitorios), no falta de permiso. */
const QUOTA_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"]);

/**
 * Cache de tokens por cuenta de servicio. La instancia por defecto vive a nivel de módulo:
 * Fluid Compute reusa la instancia entre invocaciones, así un tick por minuto no pide un
 * token nuevo cada vez. `inflight` evita que dos llamadas concurrentes pidan dos.
 */
export class TokenCache {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<string>>();

  async get(key: string, now: number, mint: () => Promise<{ token: string; expiresAt: number }>): Promise<string> {
    const hit = this.tokens.get(key);
    if (hit && now < hit.expiresAt - REFRESH_MARGIN_MS) return hit.token;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = mint()
      .then((t) => {
        this.tokens.set(key, t);
        return t.token;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  drop(key: string): void {
    this.tokens.delete(key);
  }
}

const sharedCache = new TokenCache();

export interface GoogleCalendarOptions {
  clientEmail: string;
  /** PEM. Se aceptan los saltos escapados (`\n` literal) de una llave pegada en un dashboard. */
  privateKey: string;
  calendarId: string;
  fetch?: typeof fetch;
  now?: () => number;
  cache?: TokenCache;
}

export class GoogleCalendarClient implements CalendarSync {
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly cache: TokenCache;
  private readonly events: string;
  private key: KeyObject | null = null;

  constructor(private readonly opts: GoogleCalendarOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.now = opts.now ?? Date.now;
    this.cache = opts.cache ?? sharedCache;
    this.events = `${API}/calendars/${encodeURIComponent(opts.calendarId)}/events`;
  }

  async upsertEvent(eventId: string, payload: GoogleEventPayload): Promise<void> {
    const url = `${this.events}/${eventId}`;
    // PATCH primero: es el caso común (el evento ya existe) y, como lleva `status`, también
    // revive un evento que el dueño borró a mano (Google lo guarda como "cancelled").
    let res = await this.call("PATCH", url, payload);
    if (res.ok) return;
    if (res.status === 404) {
      res = await this.call("POST", this.events, { id: eventId, ...payload });
      if (res.ok) return;
      // 409: el id ya se usó en este calendario (evento borrado y purgado del PATCH). Google
      // no deja reinsertarlo; el PATCH sí lo restaura.
      if (res.status === 409) {
        res = await this.call("PATCH", url, payload);
        if (res.ok) return;
      }
    }
    throw await apiError(res, "upsert");
  }

  async deleteEvent(eventId: string): Promise<void> {
    const res = await this.call("DELETE", `${this.events}/${eventId}`);
    // 404/410: ya no está, que es justo lo que se pedía.
    if (res.ok || res.status === 404 || res.status === 410) return;
    throw await apiError(res, "delete");
  }

  /** Llamada autenticada. Un 401 descarta el token y reintenta UNA vez. */
  private async call(method: string, url: string, body?: unknown, retryAuth = true): Promise<Response> {
    const token = await this.token();
    let res: Response;
    try {
      res = await this.fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new CalendarSyncError(`red: ${(e as Error).message}`, true);
    }
    if (res.status === 401 && retryAuth) {
      this.cache.drop(this.opts.clientEmail);
      return this.call(method, url, body, false);
    }
    return res;
  }

  private token(): Promise<string> {
    return this.cache.get(this.opts.clientEmail, this.now(), () => this.mint());
  }

  /** JWT bearer (RFC 7523): la cuenta de servicio firma su propia aserción y la canjea. */
  private async mint(): Promise<{ token: string; expiresAt: number }> {
    const iat = Math.floor(this.now() / 1000);
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const input = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: this.opts.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 })}`;
    const assertion = `${input}.${sign("RSA-SHA256", Buffer.from(input), this.privateKey()).toString("base64url")}`;

    let res: Response;
    try {
      res = await this.fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      });
    } catch (e) {
      throw new CalendarSyncError(`red (token): ${(e as Error).message}`, true);
    }
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !json.access_token) {
      // 400 invalid_grant: llave revocada o reloj corrido. No se arregla reintentando.
      const detail = json.error_description ?? json.error ?? `HTTP ${res.status}`;
      throw new CalendarSyncError(`token de Google: ${detail}`, res.status >= 500 || res.status === 429, res.status);
    }
    return { token: json.access_token, expiresAt: this.now() + (json.expires_in ?? 3600) * 1000 };
  }

  private privateKey(): KeyObject {
    if (this.key) return this.key;
    try {
      this.key = createPrivateKey(this.opts.privateKey.replace(/\\n/g, "\n"));
      return this.key;
    } catch {
      throw new CalendarSyncError("llave privada de la cuenta de servicio inválida (GOOGLE_SERVICE_ACCOUNT_JSON)", false);
    }
  }
}

/** Respuesta de error de la API → CalendarSyncError con el mensaje de Google y si conviene reintentar. */
async function apiError(res: Response, op: string): Promise<CalendarSyncError> {
  const json = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
  const reason = json?.error?.errors?.[0]?.reason ?? "";
  const message = json?.error?.message ?? `HTTP ${res.status}`;
  const retryable = res.status === 429 || res.status === 408 || res.status >= 500 || (res.status === 403 && QUOTA_REASONS.has(reason));
  return new CalendarSyncError(`Google ${op} ${res.status}${reason ? ` (${reason})` : ""}: ${message}`, retryable, res.status);
}
