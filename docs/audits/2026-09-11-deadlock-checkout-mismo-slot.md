# Deadlock (40P01) entre checkouts concurrentes del mismo slot

**Estado:** mitigado en la app (reintento único en el borde de la RPC + traducción a "horario
tomado"). Arreglo estructural en SQL **no** aplicado; ver "Opción estructural" al final.

## Resumen

Cuando dos transacciones insertan (o mueven) rangos de `reservations` que **se pisan** en el
mismo instante, Postgres puede matar a una con `40P01 deadlock detected` en vez del
`23P01 conflicting key value` que la app traduce a "Ese horario ya está tomado". El cliente
veía el texto crudo (`checkout_failed: deadlock detected`). Medido: ~5–8 % de los perdedores
de un choque por el mismo slot reciben 40P01.

No es un bug de "slots adyacentes" ni de `expire_stale_holds`, que fueron las dos hipótesis
registradas cuando se observó por primera vez. Es el comportamiento documentado de las
exclusion constraints bajo inserts concurrentes en conflicto, y el disparador real es **dos
personas reservando el mismo horario a la vez** — raro al volumen actual, pero real.

## Cómo se descubrió (2026-09-10, PR3 del directorio de clientes)

Mientras se construía un harness de dos conexiones para medir OTRO deadlock (el del canje de
puntos, arreglado en `20260909130000_customer_directory_activate.sql` con `FOR NO KEY UPDATE`),
la primera versión del harness dio **3 deadlocks de 80 intentos** que el fix no explicaba. El
log del servidor (`docker logs supabase_db_...`) mostró que esos 3 eran otra cosa:

```
CONTEXT:  while checking exclusion constraint on tuple (…) in relation "reservations"
```

El harness elegía slots "exactamente a una hora de distancia, sin hueco" — de ahí la hipótesis
"slots adyacentes". Se corrigió el harness separando los slots 49 h y el bug quedó anotado
como preexistente en `main`, para su propio ticket. El registro original vivía solo en
`.superpowers/sdd/…/task-3-report.md` (gitignored, una sola máquina); este documento lo rescata.

## Por qué la hipótesis "adyacente" no cerraba

`reservations_no_overlap` usa `tstzrange(starts_at, ends_at)` con límites `[)`
(`20260625221356_reservations.sql`). Dos rangos que se tocan (`fin == inicio`) **no** satisfacen
`&&`, y para rangos el chequeo en la hoja del GiST es exacto (no hay recheck perezoso). Un
`CONTEXT: while checking exclusion constraint` sale de `XactLockTableWait`: la sesión encontró
una tupla **no confirmada** de otra transacción que sí conflictúa y se puso a esperarla. Es decir:
los rangos SÍ se pisaban.

La explicación está en el harness original: cada intento concurrente calculaba `Date.now()`
por su cuenta, después de su propio `connect()`. Con A = `[tA+K, tA+K+1h)` y
B = `[tB+K+1h, tB+K+2h)`, los rangos se tocan solo si `tA == tB`; cada vez que B evaluó
`Date.now()` antes que A (moneda al aire), B empezaba unos milisegundos **antes** de que A
terminara → solapamiento real de unos ms → carrera de inserts en conflicto.

`expire_stale_holds` (UPDATE sin orden sobre los holds vencidos del recurso) quedó descartada
por los datos: el harness borraba las reservas entre iteraciones, así que nunca hubo holds
vencidos que actualizar, y el CONTEXT del log apunta a la constraint, no a un UPDATE.

## Reproducción (2026-09-11, Supabase local, PG 17)

Harness de dos conexiones (`pg` directo), 150 pares por brazo, slots 48 h aparte entre
iteraciones para que las iteraciones no se toquen entre sí:

| Brazo | Qué hace | ok | 23P01 | **40P01** |
|---|---|---|---|---|
| `overlap` | dos `INSERT` con rangos que se pisan 30 min, a la vez | 150 | 138 | **12** |
| `adjacent` | dos `INSERT` con rangos `[)` adyacentes, **mismo reloj** | 300 | 0 | 0 |
| `fn-overlap` | lo mismo por `create_checkout` | 150 | 143 | **7** |
| `fn-adjacent` | lo mismo por `create_checkout` | 300 | 0 | 0 |

Log del servidor durante `overlap`:

```
ERROR:  deadlock detected
DETAIL:  Process 579 waits for ShareLock on transaction 2003; blocked by process 580.
         Process 580 waits for ShareLock on transaction 2004; blocked by process 579.
         Process 579: insert into reservations (resource_id, kind, status, starts_at, ends_at, …)
CONTEXT: while checking exclusion constraint on tuple (0,57) in relation "reservations"
```

Los dos procesos están dentro del **mismo `INSERT`**, cada uno esperando la transacción del
otro: A insertó su tupla en el índice, B insertó la suya, A verifica y encuentra la de B (en
curso) → espera; B verifica y encuentra la de A → espera. Ciclo. Cuando una confirma antes de
que la otra verifique, la segunda recibe el 23P01 normal — por eso la mayoría de los choques
salen bien y solo una fracción deadlockea.

Es un comportamiento intrínseco de Postgres (`check_exclusion_or_unique_constraint` en
`execIndexing.c`): la tupla se inserta en el índice **antes** de verificar, precisamente para
que dos inserts concurrentes se vean entre sí.

**No se logró una reproducción determinista** desde SQL: el entrelazado necesario
(insert A, insert B, check A, check B) ocurre dentro de una sola sentencia por lado y no se
puede pausar con `BEGIN`/`COMMIT`. El harness estocástico con N=150 reproduce de forma estable
(4–8 % de los choques) y es lo que se usó para medir el fix.

## Superficie afectada

Toda RPC que escribe un rango de `reservations` y se apoya solo en la constraint:

| RPC | Camino | Sitio que traduce el error |
|---|---|---|
| `create_checkout` | checkout público, consola del admin | `checkout-service.ts` (`slot_taken`) |
| `redeem_practice_hours` | práctica del curso | `curso/actions.ts` (`practiceErrorMessage`) |
| `reschedule_courtesy` / `reschedule_move` / `reschedule_down` | reagendar | `reschedule-repository.ts` (`rescheduleError`) |
| `apply_reschedule_charge` | webhook/reconcile de MP tras pagar el delta | ídem |

Los tres sitios mapeaban `/exclusion|23P01|overlap/` y ninguno conocía `40P01`: el texto
`deadlock detected` llegaba crudo.

## Lo que se hizo (`fix/deadlock-checkout-40p01`)

1. **`src/infrastructure/db/rpc-retry.ts` — `retryOnDeadlock(factory)`.** Reintenta UNA vez
   una RPC cuyo `error.code === '40P01'`. Es seguro porque cada RPC es una sentencia: el
   deadlock aborta la transacción entera y no queda estado a medias; al reintentar, la
   sobreviviente ya confirmó y el segundo intento recibe el 23P01 correcto (o gana). Recibe una
   fábrica y no la promesa porque el builder de supabase-js dispara la request al hacerle
   `await`; para reintentar hay que construir uno nuevo.
2. Las seis RPC de la tabla lo usan.
3. Los tres sitios de traducción mapean además `/deadlock|40P01/` → "horario tomado", para el
   caso (raro²) de dos deadlocks seguidos.

**Medición por el adaptador real** (supabase-js → PostgREST → `create_checkout`), 150 pares
por corrida con rangos que se pisan:

| | ok | "tomado" | **deadlock al llamador** |
|---|---|---|---|
| `db.rpc` pelado (antes) | 150 | 138 | **12** |
| `SupabaseCheckoutRepository` (con reintento), corrida 1 | 150 | 150 | **0** |
| ídem, corrida 2 | 150 | 150 | **0** |

## Opción estructural (no aplicada)

Un lock de asesoría **por (recurso, día)** al inicio de cada RPC que escribe rangos —
`pg_advisory_xact_lock(hashtext(p_resource::text), <día local de p_starts>)` — serializa solo
los checkouts del mismo recurso y el mismo día (los únicos que pueden pisarse) y elimina el
ciclo: B espera el lock de A *antes* de insertar, A confirma, B inserta y recibe el 23P01
limpio. Costo: microsegundos; reservas que cruzan medianoche tendrían que tomar los dos días
en orden.

No se aplicó porque: (a) toca `create_checkout`, camino de plata, con un patrón que hoy no
existe en el repo; (b) la tasa real al volumen actual es ~0 (hace falta que dos personas
reserven el mismo horario en la misma fracción de segundo); (c) el reintento produce
exactamente el resultado correcto sin migración. Si algún día aparece contención real, esta
es la palanca, y el harness de abajo es la medición.

## Harness (no commiteado al suite; estocástico a propósito)

Guardar como `.tmp-deadlock-repro.cjs` en la raíz del repo (para que `pg` resuelva) y correr
`node .tmp-deadlock-repro.cjs <overlap|adjacent|fn-overlap|fn-adjacent> 150` contra el Supabase
local. Limpia lo que crea.

```js
const { Client } = require("pg");
const DB = "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const arm = process.argv[2] ?? "overlap";
const N = Number(process.argv[3] ?? 100);
async function client() { const c = new Client({ connectionString: DB }); await c.connect(); return c; }
async function main() {
  const a = await client(), b = await client(), ctl = await client();
  const { rows: [{ id: resourceId }] } = await ctl.query("select id from resources limit 1");
  const base = Date.parse("2027-03-01T15:00:00Z");
  const tally = { ok: 0, e23P01: 0, e40P01: 0, other: [] };
  const run = async (c, sql, params) => { try { await c.query(sql, params); return "ok"; } catch (e) { return e.code ?? e.message; } };
  const fn = `select create_checkout($1, $2, $3, 9990, 8395, 1595, 'CLP',
    jsonb_build_object('name','Race','email',$4::text,'phone',null), '{}'::jsonb, '[]'::jsonb,
    interval '10 minutes', null::uuid, 0, null::text, null::text)`;
  const ins = `insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at, customer_name, customer_email)
    values ($1, 'booking', 'held', $2, $3, now() + interval '10 minutes', 'Race', $4)`;
  for (let i = 0; i < N; i++) {
    const t0 = base + i * 48 * 3600e3;
    const adjacent = arm.endsWith("adjacent");
    const rA = [new Date(t0), new Date(t0 + 3600e3)];
    const rB = adjacent ? [new Date(t0 + 3600e3), new Date(t0 + 7200e3)] : [new Date(t0 + 1800e3), new Date(t0 + 5400e3)];
    const sql = arm.startsWith("fn") ? fn : ins;
    const [xa, xb] = await Promise.all([
      run(a, sql, [resourceId, rA[0].toISOString(), rA[1].toISOString(), `ra${i}@e.cl`]),
      run(b, sql, [resourceId, rB[0].toISOString(), rB[1].toISOString(), `rb${i}@e.cl`]),
    ]);
    for (const x of [xa, xb]) {
      if (x === "ok") tally.ok++; else if (x === "23P01") tally.e23P01++; else if (x === "40P01") tally.e40P01++; else tally.other.push(x);
    }
  }
  await ctl.query("delete from order_lines where order_id in (select id from orders where customer_email like 'r_%@e.cl')");
  await ctl.query("delete from reservations where customer_email like 'r_%@e.cl'");
  await ctl.query("delete from orders where customer_email like 'r_%@e.cl'");
  await ctl.query("delete from points_ledger where customer_id in (select id from customers where email like 'r_%@e.cl')");
  await ctl.query("delete from customers where email like 'r_%@e.cl'");
  console.log(JSON.stringify({ arm, N, ...tally, other: [...new Set(tally.other)] }));
  await Promise.all([a.end(), b.end(), ctl.end()]);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
```

Para medir el adaptador con el reintento, la variante usa `createClient` de supabase-js con
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de `.env.local` y llama
`new SupabaseCheckoutRepository(db).createCheckout(...)` en vez de `db.rpc`; clasifica por
`/conflicting key|exclusion|23P01/` vs `/deadlock/` en el mensaje. Correrla con `npx tsx`
desde la raíz del repo.
