import { describe, expect, it } from "vitest";
import {
  buildConsentDefaultScript,
  CONSENT_REGIONS_DENIED,
  consentUpdateSignals,
  parseConsent,
  serializeConsent,
  STORAGE_KEY,
} from "./consent";

describe("CONSENT_REGIONS_DENIED", () => {
  it("incluye EEA + UK + CH y excluye Chile/US", () => {
    for (const c of ["ES", "DE", "FR", "IT", "GB", "CH", "NO"]) {
      expect(CONSENT_REGIONS_DENIED).toContain(c);
    }
    expect(CONSENT_REGIONS_DENIED).not.toContain("CL");
    expect(CONSENT_REGIONS_DENIED).not.toContain("US");
  });
});

describe("buildConsentDefaultScript", () => {
  const s = buildConsentDefaultScript();
  it("define el default global (granted) y el de EEA (denied)", () => {
    expect(s).toContain("'default'");
    expect(s).toContain("analytics_storage:'granted'");
    expect(s).toContain("analytics_storage:'denied'");
    expect(s).toContain('region:["AT"');
    expect(s).toContain("wait_for_update:500");
  });
  it("re-aplica la elección guardada desde localStorage", () => {
    expect(s).toContain(`localStorage.getItem('${STORAGE_KEY}')`);
    expect(s).toContain("'update'");
  });
});

describe("serializeConsent / parseConsent", () => {
  it("round-trip de la elección", () => {
    expect(parseConsent(serializeConsent("granted", 123))).toEqual({ analytics: "granted", ts: 123 });
  });
  it("null si ausente o inválido", () => {
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("no json")).toBeNull();
    expect(parseConsent('{"analytics":"maybe","ts":1}')).toBeNull();
    expect(parseConsent('{"analytics":"granted"}')).toBeNull();
  });
});

describe("consentUpdateSignals", () => {
  it("liga las señales de ads a analytics", () => {
    expect(consentUpdateSignals("granted")).toEqual({
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
    expect(consentUpdateSignals("denied").ad_storage).toBe("denied");
  });
});
