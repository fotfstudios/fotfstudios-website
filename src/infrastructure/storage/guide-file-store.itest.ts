/**
 * Integración: bucket privado `guias` + URL firmada. Sube su propio fixture (PDF de una
 * página) para no depender del archivo real, que nunca va a git.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/src/infrastructure/db/supabase-client";
import { SupabaseGuideFileStore } from "./guide-file-store";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const db = createServiceClient(URL, KEY);
const store = new SupabaseGuideFileStore(db);
const OBJECT = "itest-guia-fixture.pdf";

beforeAll(async () => {
  const pdf = readFileSync("tests/fixtures/guia-fixture.pdf");
  const { error } = await db.storage.from("guias").upload(OBJECT, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
});

afterAll(async () => {
  await db.storage.from("guias").remove([OBJECT]);
});

describe("SupabaseGuideFileStore.signedDownloadUrl", () => {
  it("con el objeto presente devuelve una URL firmada que sirve el PDF", async () => {
    const url = await store.signedDownloadUrl(OBJECT, 60);
    expect(url).toMatch(/\/object\/sign\/guias\//);
    const res = await fetch(url!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });

  it("con el objeto ausente devuelve null (no lanza)", async () => {
    expect(await store.signedDownloadUrl("no-existe.pdf", 60)).toBeNull();
  });

  it("el bucket es privado: la URL pública sin firma no sirve el archivo", async () => {
    const res = await fetch(`${URL}/storage/v1/object/public/guias/${OBJECT}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
