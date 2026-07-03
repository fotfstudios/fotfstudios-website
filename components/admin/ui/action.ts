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

/** Como ActionResult, pero con payload en el caso ok (actions llamadas directo, sin ActionForm). */
export type ActionDataResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Como run(), pero devuelve el valor del cuerpo como data. */
export async function runData<T>(fn: () => Promise<T>): Promise<ActionDataResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Algo salió mal" };
  }
}
