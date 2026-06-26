import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMpSignature } from "./verify-signature";

const secret = "test_webhook_secret";
const dataId = "1234567890";
const xRequestId = "req-abc";
const ts = "1700000000";

function sign(): string {
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("verifyMpSignature", () => {
  it("acepta una firma válida", () => {
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId, secret })).toBe(true);
  });

  it("rechaza una firma manipulada", () => {
    expect(verifyMpSignature({ xSignature: `ts=${ts},v1=deadbeef`, xRequestId, dataId, secret })).toBe(false);
  });

  it("rechaza si falta firma o secreto", () => {
    expect(verifyMpSignature({ xSignature: null, xRequestId, dataId, secret })).toBe(false);
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId, secret: "" })).toBe(false);
  });

  it("rechaza si cambia el dataId firmado", () => {
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId: "9999", secret })).toBe(false);
  });
});
