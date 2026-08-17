import { describe, expect, it } from "vitest";
import { GUIDED_RATE, quote, bookingMessage } from "./pricing";

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
