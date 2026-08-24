import { describe, expect, it } from "vitest";
import {
  RESERVATION_KINDS,
  isRoomBlock,
  isReservationKind,
  isSellableSession,
  occupiesCabin,
} from "./reservation-kind";

describe("reservation-kind — semántica de cada kind", () => {
  it("solo booking es una hora vendida", () => {
    expect(isSellableSession("booking")).toBe(true);
    expect(isSellableSession("block")).toBe(false);
    expect(isSellableSession("curso")).toBe(false);
  });

  it("bloqueo y curso ocupan la sala sin ser venta", () => {
    expect(isRoomBlock("block")).toBe(true);
    expect(isRoomBlock("curso")).toBe(true);
    expect(isRoomBlock("booking")).toBe(false);
  });

  it("la cabina trabaja vendiendo o dictando clase, no en mantención", () => {
    expect(occupiesCabin("booking")).toBe(true);
    expect(occupiesCabin("curso")).toBe(true);
    expect(occupiesCabin("block")).toBe(false);
  });

  it("un kind desconocido no es venta ni ocupa (falla cerrado)", () => {
    expect(isReservationKind("otro")).toBe(false);
    expect(isSellableSession("otro")).toBe(false);
    expect(occupiesCabin("otro")).toBe(false);
  });

  /**
   * El bug que este módulo existe para evitar: antes la semántica vivía en ~29
   * literales, mitad lista negra (`!== "block"`) y mitad lista blanca. Un kind
   * nuevo caía del lado equivocado de ambas y corrompía métricas en silencio.
   * Si alguien agrega una kind y no decide acá qué significa, esto falla.
   */
  it("toda kind del catálogo está clasificada como venta o como uso de sala", () => {
    for (const kind of RESERVATION_KINDS) {
      expect(isSellableSession(kind) || isRoomBlock(kind)).toBe(true);
      // …y nunca las dos cosas a la vez.
      expect(isSellableSession(kind) && isRoomBlock(kind)).toBe(false);
    }
  });
});
