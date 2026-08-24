/**
 * Descuento manual del admin — matemática pura, sin I/O.
 *
 * A diferencia del descuento por volumen (que lo decide el motor a partir del
 * price book), este lo digita el staff al crear una reserva manual: "20% por
 * primera reserva", "te regalo la grabación". Se modela como UNA línea negativa
 * más sobre el quote ya cotizado — nunca mutando la línea objetivo, porque
 * `unit_price_clp` de una línea `room_time` es la tarifa horaria real y de ahí
 * cuelgan el reagendamiento y los reembolsos.
 *
 * El neto/IVA se reparten proporcionales al efectivo, igual que `applyRedemption`
 * (puntos) y que `create_boleta_amount` en SQL: así la boleta sale correcta sola.
 */
import { formatCLP, roundTo } from "@/src/domain/money/money";
import { err, ok, type Result } from "@/src/domain/shared/result";
import type { Quote } from "./types";

/**
 * Lo mínimo del quote que necesita el descuento. Un `Quote` completo lo satisface,
 * y también lo que devuelve `/api/pricing/quote` — así la consola del admin puede
 * previsualizar el total con ESTA misma función, sin reimplementar la matemática.
 */
export type DiscountableQuote = Pick<Quote, "roomSubtotal" | "addonLines" | "total" | "net">;

/** Sobre qué se calcula el descuento. */
export type DiscountTarget =
  | { kind: "room" }
  | { kind: "addon"; key: string }
  | { kind: "total" };

/** `pct` redondea a $10 (totales prolijos); `amount` respeta el peso exacto. */
export type DiscountMode = "pct" | "amount";

export interface ManualDiscountInput {
  target: DiscountTarget;
  mode: DiscountMode;
  /** Porcentaje 1..100 en modo `pct`; pesos enteros en modo `amount`. */
  value: number;
  reason: string;
}

export interface ManualDiscount {
  /** Pesos descontados, positivo. La línea se persiste en negativo. */
  amount: number;
  /** Glosa de la línea — va a la boleta, así que se lee sola. */
  description: string;
  cashTotal: number;
  cashNet: number;
  cashTax: number;
}

/**
 * Base sobre la que corre el porcentaje. `room` usa el subtotal ANTES del
 * descuento por volumen a propósito: así 10% volumen + 20% manual se SUMAN
 * (30% de la sala), que es como se le explica al cliente — y no se componen.
 */
export function resolveDiscountBase(quote: DiscountableQuote, target: DiscountTarget): number | null {
  if (target.kind === "room") return quote.roomSubtotal;
  if (target.kind === "total") return quote.total;
  return quote.addonLines.find((a) => a.key === target.key)?.amount ?? null;
}

function targetLabel(quote: DiscountableQuote, target: DiscountTarget): string {
  if (target.kind === "room") return "sala";
  if (target.kind === "total") return "";
  return quote.addonLines.find((a) => a.key === target.key)?.name ?? "";
}

export function applyManualDiscount(
  quote: DiscountableQuote,
  input: ManualDiscountInput,
): Result<ManualDiscount, string> {
  // Rango del valor. Vive acá (y no solo en el validador del borde) porque la
  // consola previsualiza con esta función: si acá pasara un 999% que el server
  // rechaza, el staff vería un total que nunca se va a cobrar.
  if (!Number.isInteger(input.value)) return err("El descuento debe ser un número entero.");
  if (input.mode === "pct" && (input.value < 1 || input.value > 100)) {
    return err("El porcentaje debe estar entre 1 y 100.");
  }

  const base = resolveDiscountBase(quote, input.target);
  if (base === null) return err("El add-on no está en esta reserva.");

  // pct: el redondeo a $10 puede pasarse de la base por unos pesos (100% de un
  // add-on de $9.995 → $10.000). Se capa en silencio: es artefacto de redondeo,
  // no un error del staff. En modo monto sí se rechaza — ahí el número lo digitó
  // una persona y conviene que lo vea.
  const amount =
    input.mode === "pct"
      ? Math.min(roundTo((base * input.value) / 100, 10), base)
      : input.value;

  if (amount <= 0) return err("El descuento debe ser mayor que $0.");
  if (amount >= quote.total) {
    return err("El descuento no puede igualar ni superar el total. Para no cobrar nada, usa Cortesía.");
  }
  if (amount > base) {
    return err(`El descuento no puede superar ${targetLabel(quote, input.target)} (${formatCLP(base)}).`);
  }

  const cashTotal = quote.total - amount;
  const cashNet = Math.round((cashTotal * quote.net) / quote.total);

  const label = targetLabel(quote, input.target);
  const head = input.mode === "pct" ? `Descuento ${input.value}%` : "Descuento";
  const reason = input.reason.trim();
  const description = [label ? `${head} ${label}` : head, reason].filter(Boolean).join(" · ");

  return ok({ amount, description, cashTotal, cashNet, cashTax: cashTotal - cashNet });
}
