import { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { retryOnDeadlock } from "./rpc-retry";

type Res = { data: string | null; error: PostgrestError | null };
const pgErr = (code: string, message: string) => new PostgrestError({ code, message, details: "", hint: "" });
const deadlock: Res = { data: null, error: pgErr("40P01", "deadlock detected") };
const taken: Res = { data: null, error: pgErr("23P01", "conflicting key value") };
const won: Res = { data: "order-1", error: null };

describe("retryOnDeadlock", () => {
  it("un éxito no se repite", async () => {
    const call = vi.fn().mockResolvedValue(won);
    expect(await retryOnDeadlock(call)).toBe(won);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("un error que NO es deadlock se devuelve tal cual, sin reintentar", async () => {
    const call = vi.fn().mockResolvedValue(taken);
    expect(await retryOnDeadlock(call)).toBe(taken);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("tras un deadlock reintenta una vez y devuelve lo que salga (el 23P01 de la sobreviviente)", async () => {
    const call = vi.fn().mockResolvedValueOnce(deadlock).mockResolvedValueOnce(taken);
    expect(await retryOnDeadlock(call)).toBe(taken);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("tras un deadlock el reintento puede ganar", async () => {
    const call = vi.fn().mockResolvedValueOnce(deadlock).mockResolvedValueOnce(won);
    expect(await retryOnDeadlock(call)).toBe(won);
  });

  it("dos deadlocks seguidos: exactamente dos intentos, y el segundo 40P01 sube al llamador", async () => {
    const call = vi.fn().mockResolvedValue(deadlock);
    expect(await retryOnDeadlock(call)).toBe(deadlock);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("construye una request nueva en cada intento (llama a la fábrica, no reusa el builder)", async () => {
    const builders: object[] = [];
    const call = vi.fn((): Promise<Res> => {
      const b = Promise.resolve(builders.length === 0 ? deadlock : won);
      builders.push(b);
      return b;
    });
    await retryOnDeadlock(call);
    expect(builders).toHaveLength(2);
    expect(builders[0]).not.toBe(builders[1]);
  });
});
