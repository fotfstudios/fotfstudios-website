import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyKapsoSignature } from "./verify-signature";

const secret = "s3cr3t";
const raw = '{"message":{"id":"wamid.1","kapso":{"status":"delivered"}},"phone_number_id":"123"}';
const sign = (body: string, key = secret) => createHmac("sha256", key).update(body).digest("hex");

describe("verifyKapsoSignature", () => {
  it("acepta la firma correcta del body crudo", () => {
    expect(verifyKapsoSignature(raw, sign(raw), secret)).toBe(true);
  });
  it("acepta mayúsculas y el prefijo sha256=", () => {
    expect(verifyKapsoSignature(raw, `sha256=${sign(raw).toUpperCase()}`, secret)).toBe(true);
  });
  it("rechaza si el body cambió, aunque sea el mismo JSON re-serializado", () => {
    const reserialized = JSON.stringify(JSON.parse(raw), null, 1);
    expect(verifyKapsoSignature(reserialized, sign(raw), secret)).toBe(false);
  });
  it("rechaza con otro secreto", () => {
    expect(verifyKapsoSignature(raw, sign(raw, "otro"), secret)).toBe(false);
  });
  it("rechaza sin header, sin secreto o con basura (sin lanzar)", () => {
    expect(verifyKapsoSignature(raw, null, secret)).toBe(false);
    expect(verifyKapsoSignature(raw, sign(raw), "")).toBe(false);
    expect(verifyKapsoSignature(raw, "zz", secret)).toBe(false);
    expect(verifyKapsoSignature(raw, "a".repeat(63), secret)).toBe(false);
  });
});
