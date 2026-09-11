import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CAPS,
  customerDbErrorCode,
  customerDbErrorMessage,
  customerLabel,
  customerSearchNeedle,
  searchableNeedle,
  isEnsureEmailConflict,
  parseCustomerInput,
  SEARCH_MAX,
} from "./customer-input";

describe("parseCustomerInput", () => {
  it("acepta nombre + email y canoniza el email", () => {
    const r = parseCustomerInput({ name: "  Matías Rojas ", email: " Matias.Rojas@Gmail.com ", phone: "" });
    expect(r).toEqual({ ok: true, value: { name: "Matías Rojas", email: "matias.rojas@gmail.com", phone: null } });
  });

  it("acepta nombre + teléfono sin email y canoniza el teléfono", () => {
    const r = parseCustomerInput({ name: "Pía Contreras", phone: "9 1234 5678" });
    expect(r).toEqual({ ok: true, value: { name: "Pía Contreras", email: null, phone: "+56912345678" } });
  });

  it.each([
    [{ name: "", email: "a@b.cl" }, "El nombre es obligatorio."],
    [{ name: "x".repeat(81), email: "a@b.cl" }, "El nombre no puede superar los 80 caracteres."],
    [{ name: "Ana", email: "sin-arroba" }, "Email no válido."],
    [{ name: "Ana", phone: "123" }, "Teléfono no válido. Usa 8 a 15 dígitos, con o sin +."],
    [{ name: "Ana" }, "Ingresa un email o un teléfono."],
    [{ name: "Ana", email: "", phone: "  " }, "Ingresa un email o un teléfono."],
  ])("rechaza %o con la frase exacta", (raw, error) => {
    expect(parseCustomerInput(raw)).toEqual({ ok: false, error });
  });

  it("acepta el nombre justo en el tope y valores no-string se leen como vacíos", () => {
    expect(parseCustomerInput({ name: "x".repeat(CUSTOMER_CAPS.name), phone: "+56912345678" }).ok).toBe(true);
    expect(parseCustomerInput({ name: 123, email: {}, phone: null })).toEqual({
      ok: false,
      error: "El nombre es obligatorio.",
    });
    expect(parseCustomerInput(null)).toEqual({ ok: false, error: "El nombre es obligatorio." });
  });

  it("el email sobre el tope de 120 cae en 'Email no válido.'", () => {
    const long = `${"x".repeat(CUSTOMER_CAPS.email)}@gmail.com`;
    expect(parseCustomerInput({ name: "Ana", email: long })).toEqual({ ok: false, error: "Email no válido." });
  });
});

describe("customerSearchNeedle", () => {
  it("escapa los comodines de ILIKE y recorta a 80", () => {
    expect(customerSearchNeedle("100%_off").text).toBe("100\\%\\_off");
    expect(customerSearchNeedle(`a,b(c)"d*e`).text).toBe("a b c  d e");
    expect(customerSearchNeedle("x".repeat(200)).text).toHaveLength(80);
  });

  // Fix round 2: el tope se aplica UNA vez, sobre el input crudo. Recortar
  // después de escapar partía el par `\%` justo en el límite y dejaba un
  // backslash suelto al final — un escape sin nada que escapar dentro del
  // patrón de ILIKE (silenciosamente sin match, o error de Postgres).
  it("nunca termina en un backslash suelto: el escape no se recorta al medio", () => {
    const needle = customerSearchNeedle("a".repeat(SEARCH_MAX - 1) + "%");

    expect(needle.text).toBe("a".repeat(SEARCH_MAX - 1) + "\\%");
    expect(needle.text).toHaveLength(SEARCH_MAX + 1); // el escape puede pasarse del tope
    expect(/(?:^|[^\\])(?:\\\\)*\\$/.test(needle.text)).toBe(false);
  });

  it("extrae dígitos solo con 3 o más", () => {
    expect(customerSearchNeedle("9988").digits).toBe("9988");
    expect(customerSearchNeedle("+56 9 6280 3298").digits).toBe("56962803298");
    expect(customerSearchNeedle("ma").digits).toBeNull();
    expect(customerSearchNeedle("a1b2").digits).toBeNull();
  });
});

describe("customerLabel", () => {
  it("cae de nombre a email a teléfono", () => {
    expect(customerLabel({ name: "Camila", email: "c@x.cl", phone: "+569" })).toBe("Camila");
    expect(customerLabel({ name: null, email: "c@x.cl" })).toBe("c@x.cl");
    expect(customerLabel({ name: "  ", email: null, phone: "+56912345678" })).toBe("+56912345678");
    expect(customerLabel({})).toBe("Cliente sin nombre");
  });
});

describe("customerDbErrorCode / customerDbErrorMessage", () => {
  it("23505 sobre customers_email_key → email_taken (con constraint o dentro del mensaje)", () => {
    expect(customerDbErrorCode("23505", "customers_email_key")).toBe("email_taken");
    expect(
      customerDbErrorCode("23505", null, 'duplicate key value violates unique constraint "customers_email_key"'),
    ).toBe("email_taken");
    expect(customerDbErrorMessage("23505", "customers_email_key")).toBe("Ese email ya pertenece a otro cliente.");
  });

  it("23514 mapea cada CHECK a la misma frase que parseCustomerInput", () => {
    expect(customerDbErrorMessage("23514", "customers_contact_required")).toBe("Ingresa un email o un teléfono.");
    expect(customerDbErrorMessage("23514", "customers_name_len")).toBe(
      "El nombre no puede superar los 80 caracteres.",
    );
    expect(customerDbErrorMessage("23514", "customers_phone_len")).toBe(
      "Teléfono no válido. Usa 8 a 15 dígitos, con o sin +.",
    );
  });

  it.each([
    ["customer_not_found", "El cliente ya no existe. Vuelve a seleccionarlo."],
    ["customer_email_invalid", "Email no válido."],
    [
      "customer_has_account",
      "Este cliente tiene cuenta: su email es su acceso y no se puede cambiar desde el panel.",
    ],
    [
      "customer_email_in_use",
      "Este cliente tiene puntos o reservas con ese email: no puede quedarse sin email.",
    ],
    ["customer_email_owned_by_other_user", "Ese email ya pertenece a otro cliente."],
    ["customer_assign_not_booking", "Solo se puede cambiar el cliente de una reserva de sala."],
    ["customer_assign_inactive", "Solo se puede cambiar el cliente de una reserva vigente."],
    [
      "customer_assign_points_order",
      "Esta reserva usó Puntos FOTF y no se puede reasignar; cancélala y vuelve a crearla.",
    ],
    [
      "customer_assign_needs_email",
      "Ese cliente no tiene email; agrégalo antes de reasignar una reserva pagada.",
    ],
    [
      "customer_checkout_needs_email",
      "Ese cliente no tiene email; agrégalo antes de cobrarle una reserva.",
    ],
  ])("traduce el literal %s de la RPC", (literal, sentence) => {
    expect(customerDbErrorMessage("P0001", null, literal)).toBe(sentence);
    // Un Error relanzado por el adaptador llega sin code: el literal basta.
    expect(customerDbErrorMessage(null, null, literal)).toBe(sentence);
  });

  it("la copia de customer_email_owned_by_other_user NO promete 'otra cuenta'", () => {
    // El literal también salta con una ficha de invitado sin reclamar y en la
    // carrera por PK: prometer "otra cuenta" sería falso en dos de los tres casos.
    const s = customerDbErrorMessage(null, null, "customer_email_owned_by_other_user") as string;
    expect(s).not.toMatch(/cuenta/i);
  });

  it("lo desconocido devuelve null / 'unknown' (nunca inventa copy)", () => {
    expect(customerDbErrorMessage("08006", null, "connection failure")).toBeNull();
    expect(customerDbErrorCode("08006", null, "connection failure")).toBe("unknown");
  });

  // Fix round 2: la búsqueda de la frase mira propiedades PROPIAS. Con el
  // operador `in`, un constraint o un literal llamado como algo de
  // Object.prototype daba true y el indexado devolvía una FUNCIÓN por una firma
  // que promete `string`.
  it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])(
    "no confunde %s (cadena del prototipo) con un sentinela conocido",
    (name) => {
      expect(customerDbErrorCode("23514", name)).toBe("unknown");
      expect(customerDbErrorMessage("23514", name)).toBeNull();
      expect(customerDbErrorCode(null, null, name)).toBe("unknown");
      expect(customerDbErrorMessage(null, null, name)).toBeNull();
    },
  );
});

describe("isEnsureEmailConflict", () => {
  it("reconoce el literal de ensure_customer_for_user", () => {
    expect(isEnsureEmailConflict({ code: "P0001", message: "customer_email_owned_by_other_user" })).toBe(true);
  });

  // TOCTOU de PR1: el chequeo de "email libre" no es serializable, así que una
  // inserción concurrente del mismo email aflora como 23505 crudo. Misma condición.
  it("trata el 23505 crudo del camino ensure como el MISMO conflicto", () => {
    expect(
      isEnsureEmailConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "customers_email_key"',
      }),
    ).toBe(true);
  });

  // El OTRO unique de la tabla: dos logins concurrentes del mismo usuario pueden
  // chocar en customers_auth_user_id_key. Eso es `auth_user_taken`, no un email
  // ocupado: mostrar la pantalla de conflicto de email sería mentirle a la persona.
  it("no trata el 23505 de customers_auth_user_id_key como conflicto de email", () => {
    expect(
      isEnsureEmailConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "customers_auth_user_id_key"',
      }),
    ).toBe(false);
  });

  it("no confunde otros errores", () => {
    expect(isEnsureEmailConflict({ code: "P0001", message: "customer_email_required" })).toBe(false);
    expect(isEnsureEmailConflict({ code: "08006", message: "connection failure" })).toBe(false);
    expect(isEnsureEmailConflict({})).toBe(false);
  });
});

/**
 * Umbral compartido por el servicio (decide si consulta) y el picker (decide
 * qué mensaje muestra). Estaban separados y el picker decía "Sin coincidencias"
 * cuando no se había buscado nada — el empujón exacto para crear una ficha
 * duplicada de alguien que sí estaba en el directorio.
 */
describe("searchableNeedle", () => {
  it("dos letras alcanzan; una no", () => {
    expect(searchableNeedle("ma")).toEqual({ text: "ma", digits: null });
    expect(searchableNeedle("m")).toBeNull();
  });

  it("tres dígitos alcanzan aunque no haya letras; dos no", () => {
    expect(searchableNeedle("998")?.digits).toBe("998");
    expect(searchableNeedle("99")).toBeNull();
  });

  /**
   * El caso que volcaba el directorio: `escapeIlike` convierte los delimitadores
   * de PostgREST en espacios, así que estos términos tienen largo crudo >= 2
   * pero dejan la aguja VACÍA. Medir el largo sobre el crudo los dejaba pasar y
   * armaba `name.ilike.%%`, que matchea todo.
   */
  it.each(["((", "()", "**", ",,", '""', "( , )"])("no deja pasar puntuación que se escapa a nada: %s", (q) => {
    expect(searchableNeedle(q)).toBeNull();
  });

  it("vacío y espacios tampoco pasan", () => {
    expect(searchableNeedle("")).toBeNull();
    expect(searchableNeedle("   ")).toBeNull();
  });

  it("mezcla de puntuación y letras suficientes sí pasa", () => {
    expect(searchableNeedle("(ma)")).not.toBeNull();
  });
});
