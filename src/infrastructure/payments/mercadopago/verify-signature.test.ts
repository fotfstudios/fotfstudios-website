import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { mpSignatureFailure, verifyMpSignature } from "./verify-signature";

const secret = "test_webhook_secret";
const dataId = "1234567890";
const xRequestId = "req-abc";
// MP manda `ts` en SEGUNDOS.
const ts = "1700000000";
const at = (seconds: number) => () => seconds * 1000;
const now = at(Number(ts));

function sign(stamp = ts): string {
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${stamp};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${stamp},v1=${v1}`;
}

describe("verifyMpSignature", () => {
  it("acepta una firma válida", () => {
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId, secret, now })).toBe(true);
  });

  it("rechaza una firma manipulada", () => {
    expect(verifyMpSignature({ xSignature: `ts=${ts},v1=deadbeef`, xRequestId, dataId, secret, now })).toBe(false);
  });

  it("rechaza si falta firma o secreto", () => {
    expect(verifyMpSignature({ xSignature: null, xRequestId, dataId, secret, now })).toBe(false);
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId, secret: "", now })).toBe(false);
  });

  it("rechaza si cambia el dataId firmado", () => {
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId: "9999", secret, now })).toBe(false);
  });

  it("rechaza un header x-signature malformado", () => {
    expect(verifyMpSignature({ xSignature: "garbage", xRequestId, dataId, secret, now })).toBe(false);
  });

  it("acepta una firma de hace 299 s (dentro de la ventana de 5 min)", () => {
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId, secret, now: at(Number(ts) + 299) })).toBe(true);
  });

  it("rechaza una firma de hace 301 s (replay)", () => {
    expect(verifyMpSignature({ xSignature: sign(), xRequestId, dataId, secret, now: at(Number(ts) + 301) })).toBe(false);
  });

  it("rechaza un ts en milisegundos (el bug del script de replay)", () => {
    const tsMs = String(Number(ts) * 1000);
    expect(verifyMpSignature({ xSignature: sign(tsMs), xRequestId, dataId, secret, now })).toBe(false);
  });
});

describe("mpSignatureFailure", () => {
  it("null cuando la firma valida", () => {
    expect(mpSignatureFailure({ xSignature: sign(), xRequestId, dataId, secret, now })).toBeNull();
  });

  it("TimestampOutOfTolerance fuera de la ventana", () => {
    expect(mpSignatureFailure({ xSignature: sign(), xRequestId, dataId, secret, now: at(Number(ts) + 301) })).toBe(
      "TimestampOutOfTolerance",
    );
  });

  it("MissingSignatureHeader sin header", () => {
    expect(mpSignatureFailure({ xSignature: null, xRequestId, dataId, secret, now })).toBe("MissingSignatureHeader");
  });

  it("SignatureMismatch con la firma alterada", () => {
    expect(mpSignatureFailure({ xSignature: `ts=${ts},v1=deadbeef`, xRequestId, dataId, secret, now })).toBe(
      "SignatureMismatch",
    );
  });

  it("MissingSecret sin clave configurada", () => {
    expect(mpSignatureFailure({ xSignature: sign(), xRequestId, dataId, secret: "", now })).toBe("MissingSecret");
  });
});
