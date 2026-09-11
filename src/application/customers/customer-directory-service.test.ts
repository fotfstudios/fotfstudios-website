import { describe, expect, it, vi } from "vitest";
import type { CustomerProfile, CustomerRepository } from "@/src/application/ports/customers";
import { CustomerDirectoryService } from "./customer-directory-service";

const MATIAS: CustomerProfile = {
  id: "cust-matias",
  authUserId: null,
  email: "matias.rojas@gmail.com",
  name: "Matías Rojas",
  phone: "+56998887766",
  pointsBalance: 1999,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function fakeRepo(over: Partial<CustomerRepository> = {}): CustomerRepository {
  return {
    search: vi.fn().mockResolvedValue([MATIAS]),
    findByEmail: vi.fn().mockResolvedValue(null),
    findByPhoneDigits: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(MATIAS),
    getProfile: vi.fn().mockResolvedValue(MATIAS),
    ...over,
  } as unknown as CustomerRepository;
}

const svc = (over: Partial<CustomerRepository> = {}) => {
  const repo = fakeRepo(over);
  return { svc: new CustomerDirectoryService(repo), repo };
};

describe("CustomerDirectoryService.search", () => {
  it("dos letras alcanzan para buscar", async () => {
    const { svc: s, repo } = svc();
    expect(await s.search("ma")).toEqual([MATIAS]);
    expect(repo.search).toHaveBeenCalledTimes(1);
  });

  it("una sola letra NO consulta la base: un ilike de un carácter devuelve medio directorio", async () => {
    const { svc: s, repo } = svc();
    expect(await s.search("m")).toEqual([]);
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("tres dígitos alcanzan aunque no haya letras", async () => {
    const { svc: s, repo } = svc();
    expect(await s.search("998")).toEqual([MATIAS]);
    expect(repo.search).toHaveBeenCalledTimes(1);
  });

  it("dos dígitos no alcanzan", async () => {
    const { svc: s, repo } = svc();
    expect(await s.search("99")).toEqual([]);
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("el término vacío o solo espacios nunca consulta", async () => {
    const { svc: s, repo } = svc();
    expect(await s.search("   ")).toEqual([]);
    expect(await s.search("")).toEqual([]);
    expect(repo.search).not.toHaveBeenCalled();
  });

  it("pasa la aguja con dígitos separados del texto", async () => {
    const { svc: s, repo } = svc();
    await s.search("9988");
    expect(repo.search).toHaveBeenCalledWith(expect.objectContaining({ digits: "9988" }), 8);
  });
});

describe("CustomerDirectoryService.create", () => {
  it("crea cuando el email es nuevo", async () => {
    const { svc: s, repo } = svc();
    const r = await s.create({ name: "Matías Rojas", email: "matias.rojas@gmail.com", phone: "" });
    expect(r.ok && r.value.kind).toBe("created");
    expect(repo.create).toHaveBeenCalledWith({
      name: "Matías Rojas",
      email: "matias.rojas@gmail.com",
      phone: null,
    });
  });

  it("un email que ya existe NO es error: devuelve esa ficha para poder usarla", async () => {
    const { svc: s, repo } = svc({ findByEmail: vi.fn().mockResolvedValue(MATIAS) });
    const r = await s.create({ name: "Otro Nombre", email: "matias.rojas@gmail.com", phone: null });
    expect(r.ok && r.value).toEqual({ kind: "exists", customer: MATIAS });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("carrera: dos del staff creando la misma ficha → el segundo recibe la existente, no un error", async () => {
    // El chequeo previo pasa (todavía no existe) y el índice único la rechaza.
    const findByEmail = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(MATIAS);
    const { svc: s } = svc({
      findByEmail,
      create: vi.fn().mockRejectedValue(new Error("email_taken")),
    });
    const r = await s.create({ name: "Matías Rojas", email: "matias.rojas@gmail.com", phone: null });
    expect(r.ok && r.value).toEqual({ kind: "exists", customer: MATIAS });
  });

  it("nombre sin email ni teléfono se rechaza con la frase del dominio", async () => {
    const { svc: s } = svc();
    const r = await s.create({ name: "Solo Nombre", email: "", phone: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Ingresa un email o un teléfono.");
  });

  it("un fallo de DB sin sentinela sale con el copy genérico, nunca texto de Postgres", async () => {
    const { svc: s } = svc({ create: vi.fn().mockRejectedValue(new Error("deadlock detected")) });
    const r = await s.create({ name: "Matías", email: null, phone: "+56998887766" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("No pudimos completar la operación. Intenta de nuevo.");
  });

  it("sin email no consulta por email: el teléfono no identifica", async () => {
    const { svc: s, repo } = svc();
    await s.create({ name: "Pía Contreras", email: null, phone: "+56911112222" });
    expect(repo.findByEmail).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith({ name: "Pía Contreras", email: null, phone: "+56911112222" });
  });
});

describe("CustomerDirectoryService.lookupPhone", () => {
  it("avisa cuando el teléfono ya está en el directorio", async () => {
    const { svc: s, repo } = svc({ findByPhoneDigits: vi.fn().mockResolvedValue(MATIAS) });
    expect(await s.lookupPhone("+56 9 9888 7766")).toEqual(MATIAS);
    expect(repo.findByPhoneDigits).toHaveBeenCalledWith("56998887766");
  });

  it("un teléfono inválido no consulta", async () => {
    const { svc: s, repo } = svc();
    expect(await s.lookupPhone("123")).toBeNull();
    expect(repo.findByPhoneDigits).not.toHaveBeenCalled();
  });
});

describe("CustomerDirectoryService — /admin/clientes", () => {
  const withRepo = (over: Partial<CustomerRepository> = {}) => {
    const repo = fakeRepo({
      list: vi.fn().mockResolvedValue({ rows: [MATIAS], total: 1, grandTotal: 1 }),
      movements: vi.fn().mockResolvedValue([]),
      bookingsForCustomer: vi.fn().mockResolvedValue([]),
      updateContact: vi.fn().mockResolvedValue(undefined),
      ...over,
    });
    return { svc: new CustomerDirectoryService(repo), repo };
  };

  it("list delega la consulta paginada tal cual", async () => {
    const { svc: s, repo } = withRepo();
    const query = { q: "ma", orden: "nombre" as const, page: 2, perPage: 25 };
    expect(await s.list(query)).toEqual({ rows: [MATIAS], total: 1, grandTotal: 1 });
    expect(repo.list).toHaveBeenCalledWith(query);
  });

  it("movements pide por id de ficha, con límite 10 por defecto", async () => {
    const { svc: s, repo } = withRepo();
    await s.movements("cust-matias");
    expect(repo.movements).toHaveBeenCalledWith("cust-matias", 10);
  });

  it("bookings usa id Y email: junta las vinculadas con las huérfanas del mismo email", async () => {
    const { svc: s, repo } = withRepo();
    await s.bookings(MATIAS);
    expect(repo.bookingsForCustomer).toHaveBeenCalledWith("cust-matias", "matias.rojas@gmail.com");
  });

  it("update parsea y escribe por el camino único (update_customer_contact)", async () => {
    const { svc: s, repo } = withRepo();
    const r = await s.update("cust-matias", { name: "Matías R.", email: "MATIAS.ROJAS@gmail.com", phone: "+56 9 9888 7766" });
    expect(r.ok).toBe(true);
    expect(repo.updateContact).toHaveBeenCalledWith("cust-matias", {
      name: "Matías R.",
      email: "matias.rojas@gmail.com",
      phone: "+56998887766",
    });
  });

  it("update rechaza la entrada inválida ANTES de tocar la base", async () => {
    const { svc: s, repo } = withRepo();
    const r = await s.update("cust-matias", { name: "", email: "x@e.cl", phone: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("El nombre es obligatorio.");
    expect(repo.updateContact).not.toHaveBeenCalled();
  });

  /**
   * Las reglas de negocio viven en la RPC y llegan como sentinelas; el servicio
   * solo traduce. Cambiarle el email a un titular de cuenta es la que más
   * importa: su email es su acceso.
   */
  it.each([
    ["customer_has_account", "Este cliente tiene cuenta: su email es su acceso y no se puede cambiar desde el panel."],
    ["customer_email_in_use", "Este cliente tiene puntos o reservas con ese email: no puede quedarse sin email."],
    ["email_taken", "Ese email ya pertenece a otro cliente."],
    ["deadlock detected", "No pudimos completar la operación. Intenta de nuevo."],
  ])("update traduce el sentinela %s", async (sentinel, phrase) => {
    const { svc: s } = withRepo({ updateContact: vi.fn().mockRejectedValue(new Error(sentinel)) });
    const r = await s.update("cust-matias", { name: "Matías", email: "otro@e.cl", phone: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(phrase);
  });
});
