import { describe, expect, it } from "vitest";
import {
  COURSE_PLANS,
  ENROLLMENT_STATUSES,
  SEAT_HOLDING_STATUSES,
  fitsInGeneration,
  holdsSeat,
  isFull,
  priceFor,
  seatsLeft,
  seatsNeeded,
  seatsTaken,
} from "./course";

const PRECIOS = { duo: 79990, individual: 139990, prueba: 19990 };

/** Fila mínima: la aritmética de cupos solo mira el estado. */
const enr = (status: string) => ({ status });

describe("holdsSeat — qué estados ocupan cupo", () => {
  it("solo reservada y pagada ocupan", () => {
    expect(holdsSeat("reservada")).toBe(true);
    expect(holdsSeat("pagada")).toBe(true);
  });

  it("anulada, expirada y trasladada liberan el asiento", () => {
    expect(holdsSeat("anulada")).toBe(false);
    expect(holdsSeat("expirada")).toBe(false);
    expect(holdsSeat("trasladada")).toBe(false);
  });

  it("un estado desconocido no ocupa (falla cerrado, no reserva de más)", () => {
    expect(holdsSeat("cualquier_cosa")).toBe(false);
  });

  // Si alguien agrega un estado nuevo a ENROLLMENT_STATUSES tiene que decidir
  // explícitamente si ocupa cupo; este test lo obliga a pasar por acá.
  it("todo estado que ocupa cupo está en el catálogo de estados", () => {
    for (const s of SEAT_HOLDING_STATUSES) {
      expect(ENROLLMENT_STATUSES).toContain(s);
    }
  });
});

describe("seatsTaken / seatsLeft — aritmética de cupos", () => {
  it("cuenta solo las inscripciones vivas", () => {
    const rows = [enr("reservada"), enr("pagada"), enr("anulada"), enr("expirada"), enr("trasladada")];
    expect(seatsTaken(rows)).toBe(2);
    expect(seatsLeft(6, seatsTaken(rows))).toBe(4);
  });

  it("una generación vacía tiene todos los cupos libres", () => {
    expect(seatsTaken([])).toBe(0);
    expect(seatsLeft(6, 0)).toBe(6);
    expect(isFull(6, 0)).toBe(false);
  });

  it("con todos los asientos tomados queda llena", () => {
    expect(seatsLeft(6, 6)).toBe(0);
    expect(isFull(6, 6)).toBe(true);
  });

  // El dueño puede achicar `seats` con gente ya dentro: el saldo se muestra 0,
  // nunca "-2" (un número negativo en la consola del admin no significa nada).
  it("nunca devuelve negativo si hay más inscritos que cupos", () => {
    expect(seatsLeft(4, 6)).toBe(0);
    expect(isFull(4, 6)).toBe(true);
  });
});

describe("priceFor / seatsNeeded — el dúo se cobra y se sienta de a dos", () => {
  it("el precio del dúo es POR PERSONA, no por pareja", () => {
    expect(priceFor(PRECIOS, "duo")).toBe(79990);
    expect(priceFor(PRECIOS, "individual")).toBe(139990);
  });

  it("un dúo ocupa dos asientos y un individual uno", () => {
    expect(seatsNeeded("duo")).toBe(2);
    expect(seatsNeeded("individual")).toBe(1);
  });

  it("todo plan cobrable tiene precio", () => {
    for (const plan of COURSE_PLANS) {
      expect(priceFor(PRECIOS, plan)).toBeGreaterThan(0);
    }
  });
});

describe("fitsInGeneration — un dúo no entra en un solo cupo", () => {
  it("con 1 cupo libre entra un individual pero NO un dúo", () => {
    expect(fitsInGeneration(6, 5, "individual")).toBe(true);
    expect(fitsInGeneration(6, 5, "duo")).toBe(false);
  });

  it("con 2 cupos libres entran ambos", () => {
    expect(fitsInGeneration(6, 4, "duo")).toBe(true);
    expect(fitsInGeneration(6, 4, "individual")).toBe(true);
  });

  it("llena no entra nadie", () => {
    expect(fitsInGeneration(6, 6, "individual")).toBe(false);
    expect(fitsInGeneration(6, 6, "duo")).toBe(false);
  });
});
