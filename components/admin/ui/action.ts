/** Resultado uniforme de las server actions del admin (para feedback con toast). */
export type ActionResult = { ok: true } | { ok: false; error: string };

/** Envuelve el cuerpo de una action: captura errores y los vuelve {ok:false}. */
export async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Algo salió mal" };
  }
}
