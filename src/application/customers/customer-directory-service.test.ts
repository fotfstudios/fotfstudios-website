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
