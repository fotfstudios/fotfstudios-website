import type { PostgrestError } from "@supabase/supabase-js";

/** SQLSTATE de "deadlock detected". */
export const DEADLOCK_CODE = "40P01";

/**
 * Reintenta UNA vez una RPC que murió por deadlock.
 *
 * Por qué existe: las funciones que escriben un rango de `reservations` (create_checkout,
 * reschedule_*, redeem_practice_hours) se apoyan solo en la exclusion constraint
 * `reservations_no_overlap`. Cuando DOS transacciones insertan rangos que se pisan en el
 * mismo instante, cada una encuentra la tupla no confirmada de la otra al verificar la
 * constraint y espera a que la otra termine → ciclo → Postgres mata a una con 40P01 en vez
 * del 23P01 que la app sí traduce a "horario tomado". Medido con harness de dos conexiones
 * sobre create_checkout: ~5 % de los perdedores de un choque por el mismo slot reciben
 * 40P01 (docs/audits/2026-09-11-deadlock-checkout-mismo-slot.md).
 *
 * El reintento es seguro porque cada RPC es UNA sentencia: el deadlock aborta la
 * transacción entera y no queda estado a medias. Al reintentar, la sobreviviente ya
 * confirmó y el segundo intento recibe el 23P01 correcto (o gana, si la otra falló por
 * otra cosa). Un solo reintento: dos deadlocks seguidos significan que el slot sigue en
 * disputa y el llamador lo traduce a "horario tomado".
 *
 * Recibe una FÁBRICA y no la promesa: el builder de supabase-js es thenable y dispara la
 * request al hacerle await; para reintentar hay que construir uno nuevo.
 */
export async function retryOnDeadlock<R extends { error: PostgrestError | null }>(call: () => PromiseLike<R>): Promise<R> {
  const first = await call();
  if (first.error?.code !== DEADLOCK_CODE) return first;
  return call();
}
