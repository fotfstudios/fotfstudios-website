import { describe, expect, it } from "vitest";
import {
  nextPollDelay,
  POLL_FAST_MS,
  POLL_FAST_WINDOW_MS,
  POLL_GRACE_AFTER_EXPIRY_MS,
  POLL_MAX_MS,
  POLL_SLOW_MS,
} from "./estado-polling";

const T0 = Date.parse("2026-09-13T21:00:00-03:00");
const EXP = "2026-09-13T21:10:00-03:00";
const base = {
  orderStatus: "pending_payment",
  reservationStatus: "held",
  holdExpiresAt: EXP,
  approvedHint: false,
  startedAt: T0,
  now: T0,
};

describe("nextPollDelay", () => {
  it("rápido los primeros 2 minutos, luego lento", () => {
    expect(nextPollDelay(base)).toBe(POLL_FAST_MS);
    expect(nextPollDelay({ ...base, now: T0 + POLL_FAST_WINDOW_MS - 1 })).toBe(POLL_FAST_MS);
    expect(nextPollDelay({ ...base, now: T0 + POLL_FAST_WINDOW_MS })).toBe(POLL_SLOW_MS);
  });
  it("se detiene con la orden en estado terminal", () => {
    for (const s of ["paid", "fulfilled", "cancelled", "refunded"]) {
      expect(nextPollDelay({ ...base, orderStatus: s })).toBeNull();
    }
  });
  it("se detiene cuando la reserva ya venció o se canceló", () => {
    expect(nextPollDelay({ ...base, reservationStatus: "expired" })).toBeNull();
    expect(nextPollDelay({ ...base, reservationStatus: "cancelled" })).toBeNull();
  });
  it("se detiene 2 minutos después del vencimiento del hold aunque el server aún diga held", () => {
    const deadline = Date.parse(EXP) + POLL_GRACE_AFTER_EXPIRY_MS;
    expect(nextPollDelay({ ...base, now: deadline - 1 })).toBe(POLL_SLOW_MS);
    expect(nextPollDelay({ ...base, now: deadline })).toBeNull();
  });
  it("hold firme (sin vencimiento): tope duro de 30 minutos", () => {
    expect(nextPollDelay({ ...base, holdExpiresAt: null, now: T0 + POLL_MAX_MS - 1 })).toBe(POLL_SLOW_MS);
    expect(nextPollDelay({ ...base, holdExpiresAt: null, now: T0 + POLL_MAX_MS })).toBeNull();
  });
  it("con pista approved sigue sondeando durante la gracia aunque la reserva ya venció", () => {
    const expired = { ...base, reservationStatus: "expired", approvedHint: true };
    expect(nextPollDelay({ ...expired, now: T0 })).toBe(POLL_FAST_MS);
    const deadline = Date.parse(EXP) + POLL_GRACE_AFTER_EXPIRY_MS;
    expect(nextPollDelay({ ...expired, now: deadline - 1 })).toBe(POLL_SLOW_MS);
    expect(nextPollDelay({ ...expired, now: deadline })).toBeNull();
    expect(nextPollDelay({ ...expired, reservationStatus: "cancelled" })).toBeNull();
  });
});
