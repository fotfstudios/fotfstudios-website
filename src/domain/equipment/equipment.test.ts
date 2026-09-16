import { describe, expect, it } from "vitest";
import {
  equipmentErrorMessage,
  parseEquipmentDetails,
  parseEquipmentInput,
  parseMoveInput,
  parsePositionValue,
  positionLabel,
  positionOptions,
  positionValue,
} from "./equipment";

const LOC = "11111111-1111-4111-8111-111111111111";
const RES = "22222222-2222-4222-8222-222222222222";

const base = {
  category: "reproductor",
  brand: "  Pioneer ",
  model: "XDJ-1000MK2",
  nickname: "",
  serialNumber: "ABC 123",
  quantity: "1",
  status: "in_service",
  locationId: LOC,
  resourceId: RES,
  spot: "  cabina   izq ",
  purchasedAt: "2024-03-15",
  purchasePriceClp: "1190000",
  vendor: "",
  warrantyUntil: "",
  notes: "",
};

describe("parseEquipmentInput", () => {
  it("normaliza: trim, espacios colapsados, vacíos → null, números → int", () => {
    const r = parseEquipmentInput(base);
    expect(r.ok && r.value).toEqual({
      category: "reproductor",
      brand: "Pioneer",
      model: "XDJ-1000MK2",
      nickname: null,
      serialNumber: "ABC 123",
      quantity: 1,
      status: "in_service",
      locationId: LOC,
      resourceId: RES,
      spot: "cabina izq",
      purchasedAt: "2024-03-15",
      purchasePriceClp: 1190000,
      vendor: null,
      warrantyUntil: null,
      notes: null,
    });
  });

  it("acepta un lote sin sala ni serie", () => {
    const r = parseEquipmentInput({ ...base, serialNumber: "", quantity: "10", resourceId: "", category: "cable" });
    expect(r.ok && r.value.quantity).toBe(10);
    expect(r.ok && r.value.resourceId).toBeNull();
  });

  it.each([
    [{ category: "teclado" }, "Categoría no válida."],
    [{ brand: "" }, "La marca es obligatoria."],
    [{ brand: "x".repeat(61) }, "La marca no puede superar los 60 caracteres."],
    [{ model: "" }, "El modelo es obligatorio."],
    [{ quantity: "0" }, "La cantidad debe ser un entero mayor o igual a 1."],
    [{ quantity: "1.5" }, "La cantidad debe ser un entero mayor o igual a 1."],
    [{ quantity: "2" }, "Un equipo con número de serie es una sola unidad (cantidad 1)."],
    [{ status: "lost" }, "Estado no válido."],
    [{ locationId: "nope" }, "Elige una ubicación."],
    [{ resourceId: "nope" }, "Sala no válida."],
    [{ purchasedAt: "15/03/2024" }, "Fecha de compra no válida (AAAA-MM-DD)."],
    [{ purchasedAt: "2024-02-30" }, "Fecha de compra no válida (AAAA-MM-DD)."],
    [{ warrantyUntil: "mañana" }, "Fecha de garantía no válida (AAAA-MM-DD)."],
    [{ purchasePriceClp: "-1" }, "El precio debe ser un entero en pesos, sin decimales."],
    [{ purchasePriceClp: "12.5" }, "El precio debe ser un entero en pesos, sin decimales."],
    [{ notes: "n".repeat(2001) }, "Las notas no pueden superar los 2000 caracteres."],
  ])("rechaza %o", (patch, error) => {
    const r = parseEquipmentInput({ ...base, ...patch });
    expect(r).toEqual({ ok: false, error });
  });

  it("no-objeto → mismos errores que un formulario vacío", () => {
    expect(parseEquipmentInput(null)).toEqual({ ok: false, error: "Categoría no válida." });
  });
});

describe("parseEquipmentDetails", () => {
  it("es el subconjunto sin posición ni estado", () => {
    const r = parseEquipmentDetails({ ...base, status: undefined, locationId: undefined });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(
      ["brand", "category", "model", "nickname", "notes", "purchasePriceClp", "purchasedAt", "quantity", "serialNumber", "vendor", "warrantyUntil"].sort(),
    );
  });
});

describe("parseMoveInput", () => {
  const cur = { quantity: 10 };
  it("acepta cantidad total por defecto y nota opcional", () => {
    const r = parseMoveInput({ quantity: "10", status: "in_service", locationId: LOC, resourceId: RES, spot: "cabina", note: "" }, cur);
    expect(r).toEqual({ ok: true, value: { quantity: 10, status: "in_service", locationId: LOC, resourceId: RES, spot: "cabina", note: null } });
  });
  it.each([
    [{ quantity: "0" }, "Cantidad fuera de rango (1 a 10)."],
    [{ quantity: "11" }, "Cantidad fuera de rango (1 a 10)."],
    [{ status: "" }, "Estado no válido."],
    [{ locationId: "" }, "Elige una ubicación."],
    [{ note: "n".repeat(501) }, "La nota no puede superar los 500 caracteres."],
    [{ spot: "s".repeat(61) }, "El lugar no puede superar los 60 caracteres."],
  ])("rechaza %o", (patch, error) => {
    const r = parseMoveInput({ quantity: "10", status: "storage", locationId: LOC, resourceId: "", spot: "", note: "", ...patch }, cur);
    expect(r).toEqual({ ok: false, error });
  });
});

describe("posición", () => {
  const catalog = {
    locations: [
      { id: LOC, name: "FOTF Studios — Viña del Mar", resources: [{ id: RES, name: "Sala de ensayo DJ" }] },
    ],
  };
  it("codifica y decodifica sede:sala", () => {
    expect(positionValue(LOC, RES)).toBe(`${LOC}:${RES}`);
    expect(positionValue(LOC, null)).toBe(`${LOC}:`);
    expect(parsePositionValue(`${LOC}:${RES}`)).toEqual({ locationId: LOC, resourceId: RES });
    expect(parsePositionValue(`${LOC}:`)).toEqual({ locationId: LOC, resourceId: null });
    expect(parsePositionValue("garbage")).toBeNull();
    expect(parsePositionValue(`${LOC}:nope`)).toBeNull();
  });
  it("lista sede sola y cada sala de la sede", () => {
    expect(positionOptions(catalog)).toEqual([
      { value: `${LOC}:`, label: "FOTF Studios — Viña del Mar (sin sala)" },
      { value: `${LOC}:${RES}`, label: "Sala de ensayo DJ" },
    ]);
  });
  it("positionLabel prefiere la sala y agrega el lugar", () => {
    expect(positionLabel({ locationName: "Sede", resourceName: "Sala de ensayo DJ", spot: "cabina" })).toBe("Sala de ensayo DJ · cabina");
    expect(positionLabel({ locationName: "Sede", resourceName: null, spot: null })).toBe("Sede");
  });
});

describe("equipmentErrorMessage", () => {
  it("traduce claves de las RPC y códigos de Postgres; lo demás es genérico", () => {
    expect(equipmentErrorMessage(null, "equipment_no_change")).toBe("El equipo ya está ahí.");
    expect(equipmentErrorMessage(null, "equipment_bad_quantity")).toBe("Cantidad fuera de rango.");
    expect(equipmentErrorMessage(null, "equipment_not_found")).toBe("Ese equipo ya no existe.");
    expect(equipmentErrorMessage("23505", "duplicate key")).toBe("Ya existe un equipo con esa serie.");
    expect(equipmentErrorMessage("23503", "fk")).toBe("La sala no pertenece a esa sede.");
    expect(equipmentErrorMessage("XX000", "boom")).toBe("No se pudo guardar el equipo. Intenta de nuevo.");
  });
});
