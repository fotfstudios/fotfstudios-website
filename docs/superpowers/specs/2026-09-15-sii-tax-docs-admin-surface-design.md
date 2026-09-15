# Spec — Documentos tributarios (SII) como pasos guiados en el admin

**Fecha:** 2026-09-15 · **Rama:** `feat/sii-docs-admin-surface` · **Estado:** diseño para revisión

## Contexto

El modelo de datos de `tax_documents` ya implementa el procedimiento del SII para boletas
electrónicas al pie de la letra (verificado contra las guías oficiales F1345/F1346/F1347-2025,
jun–jul 2025):

- **Pago** (MP u offline vía `confirm_payment`) → boleta `pendiente`.
- **Reembolso total** → nota de crédito (NC) por el total, enlazada con `reverses_document_id`.
- **Reembolso parcial / reagendamiento más barato** → NC por el total de la boleta viva **+**
  boleta nueva por el saldo. Regla SII: *"no existe la opción de modificar el monto de una
  boleta. Si necesita disminuir el precio, debe anular la boleta mediante una nota de crédito y
  luego emitir una nueva con el monto correcto."*
- **Reagendamiento más caro** → boleta adicional por el delta (*"si necesita aumentar el precio,
  debe emitir otra boleta por el monto adicional"*), financiada por la orden de delta
  (`settlement_order_id`).
- **Mismo precio, cortesía, cancelación sin reembolso** → nada.

Lo que **no** calza es la superficie del admin que le muestra ese modelo al dueño, que es quien
tiene que teclearlo en sii.cl:

1. El botón dice **"Emitir"**, pero la app no emite nada: el dueño emite en el SII y acá solo
   **registra el folio**.
2. Una NC pendiente **no dice qué folio anula** — el único dato que el formulario del SII exige —
   porque `reverses_document_id` ni siquiera se lee. Tampoco se bloquea mientras esa boleta
   sigue `pendiente` (no hay folio que referenciar).
3. Tras un reembolso parcial el dueño ve tres filas planas (boleta emitida · NC pendiente · boleta
   pendiente) sin relación ni orden.
4. Una boleta anulada sigue leyéndose "Emitida" (`is_live` no se lee): no existe estado *anulada*.
5. Sin noción de urgencia: el SII exige la boleta *"en el momento mismo en que la remuneración se
   perciba"* (art. 55 DL 825) y hay 6 meses para que la NC rebaje el débito fiscal (art. 21 LIVS,
   Ley 21.398); una NC emitida en un período ya declarado obliga a rectificar el F29.
6. **Bug:** folio vacío → toast "Documento marcado como emitido." sin guardar nada
   ([actions.ts:85-94](../../../app/admin/(panel)/reservas/[id]/actions.ts#L85-L94)).
7. **Los documentos del curso nunca pueden marcarse emitidos**: `recordBoleta` solo está cableado
   en la ficha de reserva; la card del curso remite a "la reserva correspondiente", que una
   inscripción no tiene.
8. **Registrar un folio no deja evento en el timeline**: `boleta_emitted` / `nota_credito_emitted`
   existen solo por el backfill one-shot de `20260707225000_booking_events.sql`; `recordBoleta`
   es un `update` pelado.

**Alcance:** solo la superficie del admin. El modelo de datos, cuándo se crean documentos y las
RPC de asiento **no cambian**. Sin migraciones → un solo PR, sin ventana de aprobación de prod.

## Decisiones tomadas en la conversación

- **Cola dedicada + ficha** (no solo ficha): el dueño hace la corrida del SII desde una página
  `/admin/sii` que agrupa todo lo pendiente; la ficha muestra la misma card para un pedido.
- **Bloqueo duro** de la NC hasta que su boleta tenga folio (no advertencia blanda).
- **Curso incluido**: la cola lista documentos de reservas y de curso; la ficha de inscripción
  monta la misma card, con entrada de folio.

## Parte 1 — Modelo de fila: cada documento es un "paso SII"

### `src/domain/tax/tax-doc-steps.ts` (puro, sin I/O, con tests)

```ts
describeTaxDocs(docs: TaxDocRaw[], opts: { now: DateTime }) → TaxDocStep[]
parseFolio(raw: string) → { ok: true; folio: string } | { ok: false; error: string }
```

**Entrada** (`TaxDocRaw`): las columnas que la UI nunca leyó hasta ahora, de **todos** los
documentos del pedido: `id, kind, status, folio, neto, iva, total, created_at, emitted_at,
reverses_document_id, is_live, settlement_order_id, order_id`.

**Salida** (`TaxDocStep`, uno por documento, orden cronológico `created_at`, luego `nota_credito`
antes que `boleta` en empates (misma transacción: la NC que anula precede al saldo que reemite),
luego `id`):

| `state` | Condición | Qué ve el dueño |
|---|---|---|
| `por_emitir` (gold) | boleta `pendiente` | "Emitir boleta afecta por **$X**" · neto/IVA · "pagada el 14-09 (hace 2 días)" · input de folio |
| `por_emitir` (gold) | NC `pendiente` cuya boleta padre **tiene** folio | "Emitir nota de crédito que **anula boleta folio 1234** ($X)" · razón de referencia sugerida con botón copiar · input de folio |
| `bloqueada` (quiet) | NC `pendiente` cuya boleta padre **no** tiene folio | "Primero registra el folio de la boleta de $X" · input deshabilitado |
| `emitida` (gold) | `emitida` y viva | Folio · fecha de emisión · afordance "corregir" |
| `anulada` (mute) | boleta con `is_live = false` | Folio (o "sin folio") · "anulada por NC folio 5678" / "por NC pendiente" |

Campos derivados que dan narrativa a la cadena **sin tocar la DB**:

- `role`: `pago` (primera boleta del pedido financiada por sí misma) · `delta`
  (`settlement_order_id ≠ order_id`: "Cobro adicional por reagendamiento") · `saldo` (boleta
  creada en la **misma transacción** que una NC del mismo pedido — `created_at` idéntico, porque
  `now()` es constante dentro de la tx — "Saldo tras anular folio 1234") · `nc`.
- `parentFolio` (NC → folio de `reverses_document_id`, o `null` si pendiente) y `reversedByFolio`
  (boleta → folio de la NC que la anula, o `null`).
- `razonReferencia` (solo NC): `"Anula boleta N° {folio}. {contexto}"` donde contexto es
  "Reembolso parcial: se reemite boleta por el saldo" cuando hay boleta `saldo` gemela, o
  "Anulación total" si no. Texto sugerido, copiable, no persistido.
- `ageDays` y `atrasada`: `atrasada = true` cuando el documento sigue pendiente y su `created_at`
  cae en un **mes calendario anterior** (America/Santiago) al actual — ahí ya es un período
  declarado (rectificar F29). Dentro del mes, solo edad en `bone-quiet`; Sirena únicamente para
  `atrasada` (la marca reserva Sirena para urgencia real).
- Nota especial: boleta `pendiente` **y** anulada (reembolso total antes de que el dueño la
  emitiera) → `state = por_emitir` con `note = "Ya está anulada por una NC: igual hay que
  emitirla, y luego la NC."` La NC queda `bloqueada` hasta entonces. El SII espera ambos
  documentos.

**Reglas fijas:**
- Los pasos se keyean por `id`, nunca por monto (dos boletas de igual total en un pedido es un
  caso real, ver backfill de `20260707220000`).
- Una boleta `saldo` **no** está bloqueada por la NC (el SII no necesita el folio de la NC para
  emitir una boleta).
- `parseFolio`: dígitos, 1–12 caracteres, sin espacios; vacío es error.

## Parte 2 — Superficies, acciones y timeline

### Componente compartido

`components/admin/tax-docs/TaxDocsCard.tsx` + `TaxDocStepRow.tsx` (UI compartida del admin va en
`components/admin/`, porque lo montan tres segmentos). Props: `steps: TaxDocStep[]`,
`action` (server action del segmento), `backHref` para revalidar. Botón: **"Registrar folio"** —
nunca "Emitir". Formularios con `ActionForm` + `Input` + `SubmitButton` del design system;
`StatusPill` aprende `por_emitir` ("Por emitir", gold), `bloqueada` ("Bloqueada", dim),
`anulada` ("Anulada", mute) y `atrasada` ("Atrasada", sirena).

### Tres puntos de montaje

1. **Ficha de reserva** — reemplaza la card actual en
   [page.tsx:278-310](../../../app/admin/(panel)/reservas/[id]/page.tsx#L278-L310), misma
   posición (junto a `AccessCodeCard`).
2. **Ficha de inscripción (curso)** — reemplaza la card de solo lectura en
   [inscripciones/[id]/page.tsx:119-141](../../../app/admin/(panel)/curso/inscripciones/[id]/page.tsx#L119-L141).
   Los documentos de curso ganan entrada de folio. Permiso: `reservations.boleta` (ya es
   "Registrar boleta"; no se crea uno nuevo).
3. **Cola `/admin/sii`** — `app/admin/(panel)/sii/page.tsx` + `actions.ts` + `loading.tsx`.
   Item de Sidebar **"SII"** (icono `doc`) en *Operación* después de *Curso*, badge = pendientes,
   visible solo con `reservations.boleta` (mismo criterio que Clientes/Cerradura: sin permiso no
   hay enlace). Lista **solo lo pendiente**, **agrupado por pedido**, más antiguo primero; cada
   grupo tiene cabecera con enlace a su ficha (cliente · fecha de sesión, o *Curso · generación*)
   y renderiza los mismos `TaxDocStepRow`. Los documentos ya emitidos del mismo pedido se pasan
   al derivador (para resolver padres/gemelas) pero **no se pintan**. Arriba, enlace al portal
   e-Boleta del SII y a las dos guías oficiales (emitir; anular con/sin factura electrónica).

### Dashboard

La lista completa en [page.tsx:123-160](../../../app/admin/(panel)/page.tsx#L123-L160) se
reemplaza por un panel compacto: *"5 documentos por emitir · el más antiguo hace 12 días → Ir a
SII"*. El `Stat` y el badge *por hacer* quedan igual.

### Repositorio (`admin-repository.ts`)

- `taxDocsForOrder(orderId): TaxDocRaw[]` — todos los documentos del pedido con las columnas
  completas (una query; los folios de padre/anuladora se resuelven en el derivador porque todos
  los documentos vienen en el mismo array).
- `pendingTaxDocsQueue(): PendingTaxDocGroup[]` — pedidos con ≥1 documento `pendiente`, con
  **todos** sus documentos (para que la NC bloqueada nombre a su padre) y el contexto de
  navegación: `reservationId` (por `order_id`, con fallback a `reschedules.delta_order_id` para la
  boleta delta de slot_taken), `enrollmentId`, nombre del cliente, fecha de sesión o generación.
  Dos lookups en lote como hoy hace `pendingBoletas`.
- `pendingBoletas()` se reduce a lo que necesita el panel del dashboard (count + `created_at`
  del más antiguo).

### Acción de registro

`recordBoleta` → `recordTaxDocFolio(docId, folio)` en el repositorio, expuesta por una función
de aplicación compartida (`src/application/admin/tax-doc-service.ts`) que llaman tres server
actions finas y segment-locales (`reservas/[id]/actions.ts`, `curso/actions.ts`, `sii/actions.ts`)
— las actions siguen siendo locales al segmento, como manda CLAUDE.md.

1. `parseFolio` en el dominio; vacío o inválido → error (arregla el bug del toast falso).
2. Re-deriva el paso en el servidor y **rechaza una NC bloqueada** (el input deshabilitado no es
   el guard).
3. `update tax_documents set status='emitida', folio, emitted_at=now() where id`.
4. Best-effort, sin `throw`: `rpc('log_booking_event', { p_reservation, p_type:
   'boleta_emitted' | 'nota_credito_emitted', p_order, p_tax_doc, p_amount, p_detail: { folio } })`
   — mismo patrón que la cortesía en
   [admin-repository.ts:1346](../../../src/infrastructure/db/admin-repository.ts#L1346).
   `p_reservation` resuelto por `order_id` con fallback a `reschedules.delta_order_id`. Pedidos
   de curso sin reserva no loguean (no tienen timeline).
5. **Corregir folio**: la misma acción sobre un documento ya `emitida` actualiza el folio y
   loguea otro evento con `p_detail: { folio, previous_folio }`; el timeline de la ficha lo pinta
   como "Folio corregido 1234 → 1243" (ajuste en el mapa de labels de `page.tsx`).

`emitted_at` sigue siendo `now()` al registrar: el dueño registra en la misma sentada en que
emite; un campo de fecha es YAGNI.

## Parte 3 — Errores, bordes y pruebas

### Casos borde (cada uno con test unitario del derivador)

- Reembolso total antes de emitir la boleta → boleta `por_emitir` con nota "ya anulada…"; NC
  `bloqueada` hasta que la boleta tenga folio.
- Cadena de reembolso parcial: boleta (emitida) → NC `por_emitir` "anula folio 1234" → boleta
  saldo `por_emitir` "saldo tras anular folio 1234", **no** bloqueada.
- Reagendamiento más caro con slot tomado: boleta delta vive en la orden de delta → aparece en
  la reserva vía `reschedules.delta_order_id` (ficha y cola resuelven el mismo enlace).
- Cortesía / 100 % puntos / cancelación con reembolso $0: sin documentos → card no se pinta.
- Dos boletas de igual total en el mismo pedido: pasos por `id`.
- `atrasada` en el borde de mes (31-08 23:59 vs 01-09 00:01 America/Santiago).

### Errores de la acción

Toast de error persistente (contrato a11y): folio vacío/inválido · documento inexistente · NC
bloqueada ("Primero registra el folio de la boleta de $X") · sin permiso. Un fallo al loguear el
evento va a `console.error` y **nunca** a la UI: el folio ya quedó guardado.

### Pruebas

- `src/domain/tax/tax-doc-steps.test.ts` — la tabla de estados, roles `pago/delta/saldo`,
  `parentFolio`/`reversedByFolio`, `razonReferencia`, `atrasada` en borde de mes, `parseFolio`.
- `src/infrastructure/db/tax-docs-queue.itest.ts` — seed → pago offline (`confirm_payment`) →
  reembolso parcial (`mark_refunded`); asegura que `taxDocsForOrder` trae la cadena completa y
  que `pendingTaxDocsQueue` la agrupa con su `reservationId`; `recordTaxDocFolio` escribe
  `emitted_at` + evento `boleta_emitted` con `folio` en `detail`, y rechaza una NC bloqueada.
  `npm run db:reset` al terminar.
- Contratos existentes en verde: `lib/admin-a11y-contract.test.ts`, `lib/chrome-contract.test.ts`.
- `npx eslint .` y `npm run build` con exit 0 antes de abrir el PR.
- Pasada manual local: `db:start` → `dev` → reserva manual → marcar pagada → `/admin/sii` muestra
  la boleta → registrar folio → timeline de la ficha muestra "Boleta emitida · Folio …" →
  cancelar con reembolso parcial → la cola muestra NC (desbloqueada) + boleta saldo → registrar
  ambas → la boleta original lee *Anulada por NC folio …*. Repetir con una inscripción de curso.

## Fuera de alcance (sin cambios)

Modelo de datos y RPC de `tax_documents`; cuándo se crean documentos; `pdf_url` y
`receptor_rut` (siguen sin uso); cualquier integración con la API del SII; permisos nuevos.

## Fuentes

- SII — Guías de ayuda Boleta Electrónica: <https://www.sii.cl/servicios_online/3532-guias_ayuda.html>
- Emitir boletas en e-Boleta SII (F1345-2025): <https://www.sii.cl/ayudas/boleta_electronica/emitir_boletas_electronicas_en_e-boleta.pdf>
- Anular boleta sin estar inscrito en FE (F1346-2025): <https://www.sii.cl/ayudas/boleta_electronica/anular_boleta_electronica_sin_estar_inscrito_en_facturacion_electronica.pdf>
- Anular boleta estando inscrito en FE (F1347-2025): <https://www.sii.cl/ayudas/boleta_electronica/anular_una_boleta_electronica_estando_inscrito_en_facturacion_electronica.pdf>
- SII FAQ plazos NC (6 meses, art. 21 LIVS): <https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_7335.htm>
- Art. 55 DL 825 (boleta al momento del pago en servicios): <https://leyes-cl.com/ley_sobre_impuesto_a_las_ventas_y_servicios/55.htm>
