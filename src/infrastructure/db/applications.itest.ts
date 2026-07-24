/** Integración: alta de postulaciones + lista/triage del admin (filtros, conteos, orden). */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parsePostulacionesSearchParams } from "@/src/domain/admin/postulaciones-list";
import type { ApplicationInput } from "@/src/domain/applications/application";
import { SupabaseApplicationRepository } from "./application-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseApplicationRepository(db);
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

const input = (over: Partial<ApplicationInput> = {}): ApplicationInput => ({
  name: "Valentina",
  email: "vale@correo.cl",
  phone: "+56912345678",
  format: "ambas",
  availability: "Tardes de semana",
  mixUrl: "https://soundcloud.com/vale/set",
  instagram: "vale.dj",
  genres: "House",
  pitch: "Llevo años pinchando y haciendo clases.",
  ...over,
});

beforeEach(async () => {
  await raw("truncate dj_applications cascade");
});

afterAll(async () => {
  if (connected) await pg.end();
});

describe("createApplication", () => {
  it("inserta con status 'nueva' por defecto y devuelve el id", async () => {
    const id = await repo.createApplication(input());
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const { rows } = await raw(
      "select status, name, session_format, availability, mix_url, instagram from dj_applications where id = $1",
      [id],
    );
    expect(rows[0]).toMatchObject({
      status: "nueva",
      name: "Valentina",
      session_format: "ambas",
      availability: "Tardes de semana",
      mix_url: "https://soundcloud.com/vale/set",
      instagram: "vale.dj",
    });
  });

  it("persiste instagram/genres null cuando el input los trae null", async () => {
    const id = await repo.createApplication(input({ instagram: null, genres: null }));
    const { rows } = await raw("select instagram, genres from dj_applications where id = $1", [id]);
    expect(rows[0]).toEqual({ instagram: null, genres: null });
  });
});

describe("listApplications", () => {
  it("filtra por tab, cuenta por estado y ordena por fecha desc", async () => {
    const a = await repo.createApplication(input({ name: "A" }));
    const b = await repo.createApplication(input({ name: "B" }));
    await repo.updateStatus(b, "contactada");

    const nuevas = await repo.listApplications(parsePostulacionesSearchParams({ estado: "nuevas" }));
    expect(nuevas.rows.map((r) => r.id)).toEqual([a]);
    expect(nuevas.total).toBe(1);
    expect(nuevas.tabCounts).toEqual({ nuevas: 1, contactadas: 1, descartadas: 0, todas: 2 });

    const todas = await repo.listApplications(parsePostulacionesSearchParams({ estado: "todas" }));
    expect(todas.rows).toHaveLength(2);
    // orden por created_at desc: el último insertado (b) va primero
    expect(todas.rows[0].id).toBe(b);
  });

  it("respeta la paginación (range)", async () => {
    for (let i = 0; i < 3; i++) await repo.createApplication(input({ name: `n${i}` }));
    const page1 = await repo.listApplications({ estado: "todas", page: 1, perPage: 2 });
    const page2 = await repo.listApplications({ estado: "todas", page: 2, perPage: 2 });
    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(1);
    expect(page1.total).toBe(3);
  });
});

describe("updateStatus", () => {
  it("cambia el estado y la lista lo refleja", async () => {
    const id = await repo.createApplication(input());
    await repo.updateStatus(id, "descartada");
    const descartadas = await repo.listApplications(parsePostulacionesSearchParams({ estado: "descartadas" }));
    expect(descartadas.rows.map((r) => r.id)).toEqual([id]);
  });
});

describe("CHECK constraints de la DB (última línea de defensa)", () => {
  it("rechaza un status fuera del catálogo", async () => {
    await expect(
      raw(
        "insert into dj_applications (name,email,phone,session_format,availability,mix_url,pitch,status) values ('n','e@e.cl','+56900000000','ambas','x','https://x.cl','p','x')",
      ),
    ).rejects.toThrow();
  });

  it("rechaza un session_format fuera del catálogo", async () => {
    await expect(
      raw(
        "insert into dj_applications (name,email,phone,session_format,availability,mix_url,pitch) values ('n','e@e.cl','+56900000000','otro','x','https://x.cl','p')",
      ),
    ).rejects.toThrow();
  });

  it("rechaza un name sobre el tope de 80", async () => {
    await expect(
      raw(
        "insert into dj_applications (name,email,phone,session_format,availability,mix_url,pitch) values ($1,'e@e.cl','+56900000000','ambas','x','https://x.cl','p')",
        ["a".repeat(81)],
      ),
    ).rejects.toThrow();
  });
});
