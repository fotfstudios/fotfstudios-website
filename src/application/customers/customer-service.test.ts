import { describe, expect, it, vi } from "vitest";
import type { CustomerProfile, CustomerRepository } from "@/src/application/ports/customers";
import { CustomerService } from "./customer-service";

const ADOPTED: CustomerProfile = {
  id: "cust-adoptada",
  authUserId: "user-1",
  email: "ana@fotf.cl",
  name: "Ana",
  phone: "+56912345678",
  pointsBalance: 1999,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Fake del puerto: solo lo que el test necesita, con vi.fn() para las aserciones. */
function fakeRepo(over: Partial<CustomerRepository> = {}): CustomerRepository {
  return {
    ensureForAuthUser: vi.fn().mockResolvedValue({ kind: "ok", id: ADOPTED.id }),
    awardRetroPoints: vi.fn().mockResolvedValue(0),
    getProfile: vi.fn().mockResolvedValue(ADOPTED),
    findByAuthUser: vi.fn().mockResolvedValue(ADOPTED),
    updateContact: vi.fn().mockResolvedValue(undefined),
    movements: vi.fn().mockResolvedValue([]),
    bookingsForEmail: vi.fn().mockResolvedValue([]),
    ...over,
  } as unknown as CustomerRepository;
}

describe("CustomerService.ensureCustomer", () => {
  it("asegura la ficha, da retro con el id DEVUELTO y devuelve el perfil", async () => {
    const repo = fakeRepo();
    const r = await new CustomerService(repo).ensureCustomer("user-1", "Ana@FOTF.cl");

    expect(r).toEqual({ kind: "ok", profile: ADOPTED });
    expect(repo.ensureForAuthUser).toHaveBeenCalledWith("user-1", "ana@fotf.cl");
    // El retro va sobre la FICHA (id propio), nunca sobre el usuario de auth.
    expect(repo.awardRetroPoints).toHaveBeenCalledWith("cust-adoptada");
    expect(repo.getProfile).toHaveBeenCalledWith("cust-adoptada");
  });

  it("un conflicto de email es un valor, no una excepción, y no otorga puntos", async () => {
    const repo = fakeRepo({ ensureForAuthUser: vi.fn().mockResolvedValue({ kind: "email_conflict" }) });
    const r = await new CustomerService(repo).ensureCustomer("user-1", "ana@fotf.cl");

    expect(r).toEqual({ kind: "email_conflict" });
    expect(repo.awardRetroPoints).not.toHaveBeenCalled();
    expect(repo.getProfile).not.toHaveBeenCalled();
  });
});

describe("CustomerService: resolución por auth_user_id", () => {
  it("profileByUser y movementsByUser resuelven por la cuenta, no por el id", async () => {
    const repo = fakeRepo();
    const svc = new CustomerService(repo);

    expect(await svc.profileByUser("user-1")).toEqual(ADOPTED);
    await svc.movementsByUser("user-1", 200);

    expect(repo.findByAuthUser).toHaveBeenCalledWith("user-1");
    expect(repo.movements).toHaveBeenCalledWith("cust-adoptada", 200);
  });

  it("sin ficha, movementsByUser devuelve vacío en vez de consultar por el user id", async () => {
    const repo = fakeRepo({ findByAuthUser: vi.fn().mockResolvedValue(null) });
    const svc = new CustomerService(repo);

    expect(await svc.profileByUser("user-1")).toBeNull();
    expect(await svc.movementsByUser("user-1")).toEqual([]);
    expect(repo.movements).not.toHaveBeenCalled();
  });

  it("updateProfileByUser reenvía el email ACTUAL (nunca lo cambia)", async () => {
    const repo = fakeRepo();
    await new CustomerService(repo).updateProfileByUser("user-1", { name: "Ana Silva", phone: "+56999999999" });

    expect(repo.updateContact).toHaveBeenCalledWith("cust-adoptada", {
      name: "Ana Silva",
      email: "ana@fotf.cl", // así update_customer_contact nunca ve un cambio de email de titular
      phone: "+56999999999",
    });
  });

  it("updateProfileByUser sin ficha lanza el sentinela traducible", async () => {
    const repo = fakeRepo({ findByAuthUser: vi.fn().mockResolvedValue(null) });
    await expect(
      new CustomerService(repo).updateProfileByUser("user-1", { name: "Ana", phone: null }),
    ).rejects.toThrow("El cliente ya no existe. Vuelve a seleccionarlo.");
  });

  it("traduce un sentinela de la DB a una frase antes de que llegue al toast", async () => {
    const repo = fakeRepo({ updateContact: vi.fn().mockRejectedValue(new Error("customers_name_len")) });
    await expect(
      new CustomerService(repo).updateProfileByUser("user-1", { name: "x".repeat(81), phone: null }),
    ).rejects.toThrow("El nombre no puede superar los 80 caracteres.");
  });

  // Fix round 1, hallazgo importante: un error SIN sentinela reconocido (de la
  // ESCRITURA, updateContact) nunca debe filtrar texto crudo al `.message` que
  // `run()` muestra tal cual en el toast — pero el original sigue disponible
  // en `.cause` para logs.
  it("un fallo de escritura sin sentinela conocido sale genérico en .message, con el original en .cause", async () => {
    const repo = fakeRepo({ updateContact: vi.fn().mockRejectedValue(new Error("deadlock detected")) });
    const err: Error = await new CustomerService(repo)
      .updateProfileByUser("user-1", { name: "Ana", phone: null })
      .then(() => {
        throw new Error("se esperaba que rechazara");
      })
      .catch((e: unknown) => e as Error);

    expect(err.message).toBe("No pudimos completar la operación. Intenta de nuevo.");
    expect(err.message).not.toMatch(/deadlock/i);
    expect(String(err.cause)).toMatch(/deadlock detected/i);
  });

  // Fix round 1, hallazgo importante: misma garantía para un fallo de LECTURA
  // (findByAuthUser) — es la ruta que estaba dormida porque perfil/actions.ts
  // todavía llama al método deprecado; Task 7 la despierta.
  it("un fallo de lectura (findByAuthUser) sin sentinela conocido también sale genérico, nunca crudo", async () => {
    const repo = fakeRepo({
      findByAuthUser: vi.fn().mockRejectedValue(new Error('invalid input syntax for type uuid: "x"')),
    });
    const err: Error = await new CustomerService(repo)
      .updateProfileByUser("user-1", { name: "Ana", phone: null })
      .then(() => {
        throw new Error("se esperaba que rechazara");
      })
      .catch((e: unknown) => e as Error);

    expect(err.message).toBe("No pudimos completar la operación. Intenta de nuevo.");
    expect(err.message).not.toMatch(/uuid|syntax/i);
    expect(String(err.cause)).toMatch(/invalid input syntax for type uuid/i);
  });
});
