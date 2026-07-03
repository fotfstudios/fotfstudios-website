# Página de analíticas del admin — diseño

- **Date:** 2026-07-03
- **Status:** Design approved
- **Scope:** Nueva página `/admin/analitica` con ingresos, ocupación, embudo de reservas y
  clientes/add-ons; rangos 7/30/90 días + navegación mensual; charts SVG a mano (sin
  dependencias); permiso RBAC nuevo `analytics.view`.

## Context

Decisiones del dueño (brainstorming): los CUATRO grupos de métricas; rangos duales (pills +
mes); charts hechos a mano on-brand (norma sin-deps del repo; volumen de datos de una sala
no justifica una librería); permiso nuevo gated por rol (super_admin lo hereda vía token
hook; staff solo si se le asigna).

**Arquitectura aprobada (A):** el repo trae filas crudas acotadas (≤ cientos para 90 días) y
TODA la matemática vive en un módulo puro `src/domain/analytics/` — testeable con fixtures,
DST-safe reutilizando `src/domain/scheduling/time.ts`. Sin RPC de agregación (los datos no lo
ameritan y el patrón de la casa es fetch→reduce, como `dashboard()`).

**Out of scope:** export CSV, comparativas año-contra-año, multi-recurso (hay una sala),
gráficos con leyendas multi-serie, date-picker libre.

## Definiciones de métricas (pinned — fuente única)

| Métrica | Definición |
|---|---|
| Ingresos | `amount_clp − refunded_amount_clp` de órdenes paid/refunded, atribuidos por fecha de SESIÓN (`reservations.starts_at` en el rango, TZ Santiago) |
| Ocupación | minutos reservados (kind=booking, status confirmed) ÷ minutos abiertos (`opening_hours` ajustado por `schedule_exceptions`: cerrado y overrides) |
| Sesiones pagadas | reservas kind=booking con orden paid/refunded en rango |
| Ticket promedio | ingresos ÷ sesiones pagadas |
| Recurrente | email (lowercase) con ≥1 orden pagada ANTERIOR al inicio del rango |
| Lead time | mediana de `starts_at − orders.created_at` de sesiones pagadas |
| Fuente | online (`mp_payment_id` sin `offline:`), offline (`offline:%`), cortesía (kind=booking sin `order_id`) |
| Comisiones MP | suma de `payment_snapshot.fee_amount` donde exista (solo pagos online — rotulado) |
| Δ | vs período anterior del mismo largo (pills) / vs mes anterior (nav mensual) |
| Buckets | día para ≤31 días y mes; semana (lunes, Santiago) para 90 días |

## Componentes

| Archivo | Status | Propósito |
|---|---|---|
| `supabase/migrations/*_analytics_permission.sql` | new | Seed `analytics.view` (paridad con permissions.ts; rbac.itest la verifica) |
| `src/domain/analytics/metrics.ts` + `.test.ts` | new | `computeAnalytics(rows, ctx)` puro: buckets, ocupación, embudo, add-ons, clientes, deltas |
| `app/admin/(panel)/analitica/page.tsx` + `loading.tsx` | new | RSC force-dynamic; `requirePermission("analytics.view")`; `?r=7\|30\|90` / `?m=YYYY-MM` |
| `components/admin/ui/Stat.tsx` | new | KPI tile compartido (promovido del dashboard) + `delta?` (▲ gold / ▼ bone-dim; sirena reservada a urgencia) |
| `components/admin/ui/Bars.tsx` | new | Bar chart SVG single-series server-safe (specs dataviz abajo) |
| `components/admin/ui/MeterCell.tsx` | new | Barra % div-based para tablas (attach rate) |
| `src/domain/auth/permissions.ts` | modify | + `analytics.view` |
| `src/infrastructure/db/admin-repository.ts` | modify | `analyticsRows(start,end)` + `priorCustomerEmails(before, emails)` |
| `components/admin/format.ts` | modify | + `fmtPct` |
| `components/admin/ui/icons.tsx` | modify | + icono `chart` |
| `components/admin/AdminShell.tsx` · `Sidebar.tsx` | modify | `show.analytics` + ítem gated "Analíticas" |
| `app/admin/(panel)/page.tsx` | modify | usa el `Stat` compartido (dedupe) |

## Dataviz compliance (método aplicado)

Forma primero: headline numbers → Stat tiles (no chart); magnitud temporal → barras single-
serie; categorías pocas → tablas (+ meter bars). Color: serie única GOLD sobre Ink (contraste
validado con `validate_palette.js --mode dark`, superficie #0a0a0a); el TEXTO siempre en
tokens bone, nunca del color de la serie; sirena reservada (status/urgencia). Marcas: barras
finas, gap 2px, data-ends redondeados anclados a baseline, ejes/grid recesivos (hairline/
bone-mute), labels selectivos (primero/último/máximo). Sin leyendas (una serie por chart;
el título nombra la serie). Tooltips: `<title>` nativo por barra + `aria-label` + `role=img`.
Fallback accesible: cada chart convive con su tabla en las cards vecinas.

## Composición de página (aprobada)

PageHeader "Analíticas" (kicker Análisis, 1 línea Fraunces) · pills de rango como links
(activo `bg-gold text-ink`) + nav mensual `‹ mes ›` · fila KPI (Ingresos Δ, Ocupación % Δ,
Sesiones Δ, Ticket promedio) · Card "Ingresos por día" (Bars, CLP) · Card "Ocupación por día
de semana" (Bars %, denominador real) · grid 2-col: "Embudo" (tabla counts) + "Add-ons"
(tabla attach + MeterCell) · Card "Clientes" (nuevos vs recurrentes, top 5 por ingresos,
lead time mediano) · EmptyState sin datos.

## Error handling

Rango/mes inválido en URL → default (r=30). Sin recurso activo → EmptyState. División por
cero (0 sesiones, 0 minutos abiertos) → 0%/"—". `payment_snapshot` ausente → fila excluida
de comisiones (rotulado "solo pagos online").

## Testing (Vitest)

`metrics.test.ts` con fixtures: buckets borde de rango y de mes; semana DST (Santiago cambia
en abril/septiembre); ocupación con excepción cerrada y con override de horario; attach rate;
nuevos vs recurrentes; deltas con período anterior vacío (Δ null, no ∞); mediana par/impar;
fuentes online/offline/cortesía. rbac.itest verifica paridad del permiso.

## Verification

1. `npm run db:reset` (aplica seed) → `npm test` · `npx eslint .` · `npm run build` → exit 0.
2. `npm run test:integration` (paridad RBAC) → `npm run db:reset` después.
3. Browser con sesión admin: KPIs coherentes con la seed; pills/mes navegan por URL; sidebar
   muestra Analíticas (super_admin); staff sin permiso: sin ítem y página directa rechaza.
4. Validador dataviz sobre gold/ink modo dark durante la implementación.
5. **Prod:** aplicar la migración seed en Supabase remoto al desplegar (las migraciones NO se
   auto-aplican con el deploy de Vercel).
