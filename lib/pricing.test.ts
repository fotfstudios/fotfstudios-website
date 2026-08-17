import { describe, expect, it } from "vitest";
import { GUIDED_RATE, quote, bookingMessage, ADDONS } from "./pricing";
import { PACKS, PACK_EGRESADO, GUIDED_BLOCK, RECORDING_SESSIONS } from "./pricing";

describe("guided (1:1) pricing — canonical flat rate", () => {
  it("charges GUIDED_RATE per coach hour regardless of tier", () => {
    // Monday 09:00, valle. 2h room + 1h coach.
    const q = quote({ day: 1, start: 9, hours: 2, coachHours: 1 });
    expect(GUIDED_RATE).toBe(14990);
    expect(q.coachSubtotal).toBe(14990); // NOT 9990 (tier rate)
  });

  it("excludes coach hours from the volume discount", () => {
    const q = quote({ day: 1, start: 9, hours: 2, coachHours: 2 });
    // room 2h valle = 19980, 10% volume on room only = 1998
    expect(q.roomSubtotal).toBe(19980);
    expect(q.discount).toBe(1998);
    // total = 19980 - 1998 + 29980 = 47962 → rounded to 47960
    expect(q.total).toBe(47960);
  });

  it("prints the flat rate in the WhatsApp breakdown", () => {
    const q = quote({ day: 1, start: 9, hours: 2, coachHours: 1 });
    const msg = bookingMessage({ day: 1, start: 9, hours: 2, coachHours: 1 }, q);
    expect(msg).toContain("$14.990");
  });
});

describe("A+V add-on reprice (spec 2026-08-17)", () => {
  it("is 39990 everywhere the marketing engine sees it", () => {
    expect(ADDONS.audioVideo.price).toBe(39990);
    const q = quote({ day: 1, start: 9, hours: 1, audioVideo: true });
    expect(q.total).toBe(49980); // 9990 room + 39990 A+V, no discount at 1h
  });
});

describe("phase-1 SKU constants", () => {
  it("match the approved spec prices", () => {
    expect(PACKS).toEqual([{ hours: 8, price: 67990 }, { hours: 12, price: 95990 }]);
    expect(PACK_EGRESADO).toEqual({ hours: 5, price: 39990, windowDays: 90 });
    expect(GUIDED_BLOCK).toEqual({ sessions: 4, price: 54990 });
    expect(RECORDING_SESSIONS.audio).toEqual([{ hours: 2, price: 29990 }, { hours: 3, price: 35990 }]);
    expect(RECORDING_SESSIONS.audioVideo).toEqual([
      { hours: 1, price: 49990 }, { hours: 2, price: 59990 }, { hours: 3, price: 65990 },
    ]);
  });

  it("never undercuts the DIY widget path (no reverse arbitrage, spec §mechanics)", () => {
    for (const s of RECORDING_SESSIONS.audio) {
      const diy = quote({ day: 1, start: 9, hours: s.hours, audio: true });
      expect(s.price).toBeGreaterThanOrEqual(diy.total);
    }
    for (const s of RECORDING_SESSIONS.audioVideo) {
      const diy = quote({ day: 1, start: 9, hours: s.hours, audioVideo: true });
      expect(s.price).toBeGreaterThanOrEqual(diy.total);
    }
  });
});
