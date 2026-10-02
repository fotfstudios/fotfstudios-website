import { describe, expect, it } from "vitest";
import { chileanMobile, parseOwnerWhatsapp, waRecipient } from "./whatsapp-recipient";

describe("chileanMobile", () => {
  it.each([
    ["+56 9 1234 5678", "56912345678"],
    ["912345678", "56912345678"],
    ["0056912345678", "56912345678"],
    ["(+56) 9-1234-5678", "56912345678"],
  ])("%s → %s", (raw, out) => expect(chileanMobile(raw)).toBe(out));

  it.each([
    ["fijo de Santiago", "+56 2 2345 6789"],
    ["número extranjero", "+1 415 555 0100"],
    ["incompleto", "9 1234 567"],
    ["vacío", ""],
  ])("%s → null", (_label, raw) => expect(chileanMobile(raw)).toBeNull());

  it("null/undefined → null", () => {
    expect(chileanMobile(null)).toBeNull();
    expect(chileanMobile(undefined)).toBeNull();
  });
});

describe("waRecipient", () => {
  it("con consentimiento y celular chileno → dígitos", () => {
    expect(waRecipient({ phone: "+56912345678", whatsappOptIn: true })).toBe("56912345678");
  });
  it("sin consentimiento → null aunque el número sirva", () => {
    expect(waRecipient({ phone: "+56912345678", whatsappOptIn: false })).toBeNull();
    expect(waRecipient({ phone: "+56912345678", whatsappOptIn: null })).toBeNull();
  });
  it("con consentimiento pero sin celular chileno → null", () => {
    expect(waRecipient({ phone: "+56 2 2345 6789", whatsappOptIn: true })).toBeNull();
    expect(waRecipient({ phone: null, whatsappOptIn: true })).toBeNull();
  });
});

describe("parseOwnerWhatsapp", () => {
  const line = "56962803298";
  it("acepta un celular en cualquier formato", () => {
    expect(parseOwnerWhatsapp("+56 9 1111 2222", line)).toBe("56911112222");
    expect(parseOwnerWhatsapp("911112222", line)).toBe("56911112222");
  });
  it("rechaza la línea del estudio: WhatsApp no deja escribirse a sí mismo", () => {
    expect(parseOwnerWhatsapp("+56 9 6280 3298", line)).toBeNull();
  });
  it("vacío o basura → null", () => {
    expect(parseOwnerWhatsapp("", line)).toBeNull();
    expect(parseOwnerWhatsapp(undefined, line)).toBeNull();
    expect(parseOwnerWhatsapp("abc", line)).toBeNull();
  });
});
