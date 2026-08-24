/** Integración: alta de solicitudes del curso + bandeja del admin (tabs, conteos, orden). */
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseSolicitudesSearchParams } from "@/src/domain/admin/curso-solicitudes-list";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import { SupabaseCourseRepository } from "./course-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseCourseRepository(db);
const pg = new Client({ connectionString: DB_URL });
let connected = false;

async function raw(sql: string, params: unknown[] = []) {
  if (!connected) {
    await pg.connect();
    connected = true;
  }
  return pg.query(sql, params);
}

const input = (over: Partial<CourseLeadInput> = {}): CourseLeadInput => ({
  name: "Camila Rojas",
  email: "cami@correo.cl",
  phone: "+56912345678",
  plan: "duo",
  experience: "cero",
  availability: "Martes y jueves en la tarde",
  message: "Voy con una amiga.",
  ...over,
});

const q = (over: Record<string, string> = {}) => parseSolicitudesSearchParams(over);

beforeEach(async () => {
  await raw("truncate course_leads cascade");
});

afterAll(async () => {
  if (connected) await pg.end();
});

describe("createLead", () => {
  it("inserta con status 'nueva' por defecto y devuelve el id", async () => {
    const id = await repo.createLead(input(), null);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const { rows } = await raw(
      "select status, name, plan, experience, message, generation_id from course_leads where id = $1",
      [id],
    );
    expect(rows[0]).toMatchObject({
      status: "nueva",
      name: "Camila Rojas",
      plan: "duo",
      experience: "cero",
      message: "Voy con una amiga.",
      generation_id: null,
    });
  });

  // Una solicitud NO es una inscripción: no puede tocar el cupo.
  it("una solicitud no crea ninguna inscripción", async () => {
    await repo.createLead(input(), null);
    const { rows } = await raw("select count(*)::int as n from course_enrollments");
    expect(rows[0].n).toBe(0);
  });

  it("el mensaje opcional acepta null", async () => {
    const id = await repo.createLead(input({ message: null }), null);
    const { rows } = await raw("select message from course_leads where id = $1", [id]);
    expect(rows[0].message).toBeNull();
  });
});

describe("listLeads — bandeja del admin", () => {
  it("filtra por tab, cuenta por estado y ordena por fecha desc", async () => {
    const a = await repo.createLead(input({ name: "A", email: "a@correo.cl" }), null);
    const b = await repo.createLead(input({ name: "B", email: "b@correo.cl" }), null);
    await repo.updateLeadStatus(b, "contactada");

    const nuevas = await repo.listLeads(q());
    expect(nuevas.rows.map((r) => r.id)).toEqual([a]);
    expect(nuevas.tabCounts).toEqual({ nuevas: 1, contactadas: 1, inscritas: 0, descartadas: 0, todas: 2 });
    expect(nuevas.grandTotal).toBe(2);

    const todas = await repo.listLeads(q({ estado: "todas" }));
    // Más reciente primero.
    expect(todas.rows.map((r) => r.name)).toEqual(["B", "A"]);
  });

  // grandTotal separa "todavía no llega ninguna" de "este tab está vacío":
  // son dos estados vacíos con copy distinto en la UI.
  it("grandTotal distingue bandeja vacía de tab vacío", async () => {
    const vacia = await repo.listLeads(q());
    expect(vacia.grandTotal).toBe(0);

    const id = await repo.createLead(input(), null);
    await repo.updateLeadStatus(id, "descartada");
    const sinNuevas = await repo.listLeads(q());
    expect(sinNuevas.rows).toHaveLength(0);
    expect(sinNuevas.grandTotal).toBe(1);
  });

  it("el triage es reversible", async () => {
    const id = await repo.createLead(input(), null);
    await repo.updateLeadStatus(id, "descartada");
    await repo.updateLeadStatus(id, "nueva");
    expect((await repo.getLead(id))?.status).toBe("nueva");
  });

  it("nuevasCount alimenta el badge de la barra lateral", async () => {
    await repo.createLead(input({ email: "1@correo.cl" }), null);
    await repo.createLead(input({ email: "2@correo.cl" }), null);
    const tercero = await repo.createLead(input({ email: "3@correo.cl" }), null);
    await repo.updateLeadStatus(tercero, "contactada");
    expect(await repo.nuevasCount()).toBe(2);
  });

  it("pagina sin perder el tab", async () => {
    for (let i = 0; i < 3; i++) await repo.createLead(input({ email: `p${i}@correo.cl` }), null);
    const page2 = await repo.listLeads({ estado: "nuevas", page: 2, perPage: 2 });
    expect(page2.rows).toHaveLength(1);
    expect(page2.total).toBe(3);
  });
});

describe("CHECK constraints de la DB (última línea de defensa)", () => {
  it("rechaza un plan fuera del catálogo", async () => {
    await expect(
      raw(
        `insert into course_leads (name, email, phone, plan, experience, availability)
         values ('n','e@e.cl','+56900000000','trio','cero','x')`,
      ),
    ).rejects.toThrow();
  });

  it("rechaza un nombre sobre el tope", async () => {
    await expect(
      raw(
        `insert into course_leads (name, email, phone, plan, experience, availability)
         values ($1,'e@e.cl','+56900000000','duo','cero','x')`,
        ["x".repeat(81)],
      ),
    ).rejects.toThrow();
  });
});
