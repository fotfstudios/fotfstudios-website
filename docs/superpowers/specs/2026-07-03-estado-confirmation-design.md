# Página de confirmación `/reserva/estado` — diseño

- **Date:** 2026-07-03
- **Status:** Design approved
- **Scope:** Enriquecer la página post-pago (recibo, próximos pasos, agregar al calendario,
  pulido de marca) en sus tres estados. Sin cambios en el endpoint de estado ni en emails.

## Context

Hoy la página es la más plana del flujo: una caja con borde, un titular y un link a WhatsApp.
Decisiones de brainstorming con el dueño:

1. **Alcance completo:** tarjeta con el detalle de la reserva + guía de próximos pasos +
   agregar al calendario (.ics y Google Calendar) + pulido visual/motion al nivel del sitio.
2. **Los tres estados** reciben el tratamiento completo (pagado / fallido / confirmando),
   más manejo correcto de `refunded`/`fulfilled` (hoy el polling nunca se detiene en esos).
3. **Privacidad:** detalle de la reserva + solo el PRIMER NOMBRE ("¡Listo, Ana!") — nunca
   email/teléfono. El modelo de lectura ni siquiera los selecciona.
4. **Flujo de datos:** los detalles se renderizan en el SERVIDOR (`page.tsx`) vía un nuevo
   modelo de lectura; la isla cliente sigue haciendo polling del endpoint liviano existente
   `GET /api/orders/[id]/status` (SIN CAMBIOS) solo para el flip pending→paid en vivo.

**Out of scope:** cambios al endpoint de estado (mantiene reconcile bajo demanda), cambios a
los emails, tests de componentes (el repo no tiene framework para eso), políticas inventadas
en el copy (nada de "llega X min antes").

## Componentes

| Archivo | Status | Propósito |
|---|---|---|
| `lib/ics.ts` | new | Builders puros: archivo ICS (RFC 5545) + URL de Google Calendar |
| `lib/ics.test.ts` | new | Unit tests (vitest solo incluye `src/**` y `lib/**`) |
| `lib/confirmation.ts` | new | View-model puro: firstName, when, timeRange, durationLabel, líneas CLP |
| `lib/confirmation.test.ts` | new | Unit tests |
| `components/booking/ReceiptCard.tsx` | new | Recibo presentacional (variante `skeleton`) |
| `components/booking/CalendarButtons.tsx` | new | Cliente: descarga .ics vía Blob + link Google |
| `src/application/ports/orders.ts` | modify | Tipo `OrderConfirmation` + interfaz `OrderConfirmationReader` |
| `src/infrastructure/db/order-repository.ts` | modify | `getOrderConfirmation()` (3 queries + join `resources(name)`) |
| `src/composition.ts` | modify | Accessor `orderConfirmation(orderId)` |
| `app/reserva/estado/page.tsx` | modify | Fetch en servidor, `notFound()` si no existe, pasa view + initialStatus |
| `components/booking/EstadoClient.tsx` | modify | Rediseño completo (máquina de estados + 4 layouts) |

## Modelo de lectura

`getOrderConfirmation(orderId)` espeja `getOrderForEmail` (notification-repository.ts) y suma
el nombre de la sala vía select anidado `resources(name)` en reservations. Devuelve
`{ orderId, orderStatus, customerName, startsAt|null, endsAt|null, resourceName|null,
reservationStatus|null, lines[{description, subtotal}], total, currency }`. Orden sin reserva
(cancelada antes del hold, o pago tardío) degrada a nulls: el estado pagado tolera
`startsAt === null` (recibo sin bloque de fecha, sin botones de calendario).

## Estados (máquina + layouts)

`TERMINAL = {paid, fulfilled, cancelled, refunded}`. Si el servidor ya entregó un estado
terminal, cero fetches. Si no, polling cada 3 s al endpoint liviano; el efecto termina al
volverse terminal. Errores de fetch mantienen el shell "Confirmando…" (el reconcile del
endpoint sigue intentando). UI: `confirmed` (paid|fulfilled), `failed` (cancelled),
`refunded`, `pending` (resto).

Shell persistente con `role="status"` y `aria-live="polite"` (anuncia el flip).

- **Confirmed:** kicker dorado `Reserva confirmada` → H1 MaskText `¡Listo, {nombre}!`
  (fallback `¡Reserva confirmada!`) → línea editorial Fraunces (única de la página):
  *La cabina es tuya.* → `ReceiptCard` en un `Reveal` → próximos pasos `<ol>` 01/02/03 →
  CTAs: WhatsApp dorado (prefill con la fecha) + secundarios hairline `.ics` y Google
  Calendar (solo si hay fechas y la sesión no pasó).
- **Failed:** sirena SOLO en el kicker (`Pago no completado`); H1 `El pago no se completó`;
  `No se realizó ningún cobro. Puedes intentarlo de nuevo cuando quieras.`; CTA dorado
  `Volver a reservar →`; link de ayuda por WhatsApp. Sin recibo.
- **Refunded (neutro, no sirena):** `Tu pago fue devuelto` + cuerpo + CTAs.
- **Pending:** kicker `Procesando`, H1 `Confirmando tu pago…`, `ReceiptCard skeleton`.

## Calendario

`buildIcs(event, {dtstamp?})`: CRLF, timestamps UTC `yyyyLLdd'T'HHmmss'Z'`, escaping TEXT
RFC 5545 (`\` `;` `,` saltos), plegado de líneas a 74 chars, `PRODID:-//FOTF Studios//
Reservas//ES`, `UID` determinista `fotf-${orderId}@fotfstudios.cl`, `dtstamp` inyectable.
`googleCalendarUrl()`: `action=TEMPLATE`, `dates=utc/utc`. Descarga por Blob + `<a download>`
(sin endpoint nuevo).

## Copy (español de Chile — espeja el email)

"¡Reserva confirmada!", "Coordinaremos tu acceso por WhatsApp antes de tu sesión.",
"IVA incluido" idénticos a `templates.ts`. Pasos: email enviado · acceso por WhatsApp
(reusa STEPS 02: "Entras solo, sin esperar a nadie.") · dirección + `Ver en Google Maps →`
(`SITE.mapsUrl`). Prefill WhatsApp vía `whatsappLink()`.

## Brand fidelity

Solo tokens existentes (`ink/bone/gold/sirena`, `.label`, `.hairline`, `.grain`,
`font-display`, `font-editorial`). Sirena únicamente en el kicker del estado fallido.
Una sola línea Fraunces. Sin librerías de UI nuevas ni dependencias npm nuevas.

## Accessibility

`role="status"` + `aria-live="polite"` en el shell; links reales (no divs clickeables);
skeleton `aria-hidden` (ya lo es); motion respeta `prefers-reduced-motion` vía el bloque
global de `globals.css` (MaskText/Reveal/skeleton cubiertos).

## Error handling

UUID inválido o orden inexistente → `notFound()` (404). Orden sin reserva → recibo sin
fecha/calendario. Fetch de polling fallido → se mantiene "Confirmando…" y se reintenta
(sin estado "unknown"). `fulfilled` con sesión pasada → sin botones de calendario.

## Testing (Vitest)

- `lib/ics.test.ts`: conversión UTC desde ISO `-04:00`; VERSION/PRODID/UID; DTSTAMP inyectado
  (determinismo); todo CRLF; escaping; plegado >74; omisión de campos opcionales; params de
  la URL de Google.
- `lib/confirmation.test.ts`: `firstNameOf` (multi-nombre, vacío/null); `durationLabel`
  (2 h, 1,5 h); `buildConfirmationView` (formato `when` idéntico al email, es-CL/Santiago;
  CLP; reserva null → nulls; passthrough de sala).

## Files touched (summary)

Nuevos: `lib/ics.ts(.test)`, `lib/confirmation.ts(.test)`,
`components/booking/ReceiptCard.tsx`, `components/booking/CalendarButtons.tsx`, este spec.
Modificados: `ports/orders.ts`, `order-repository.ts`, `composition.ts`,
`app/reserva/estado/page.tsx`, `EstadoClient.tsx`. Sin cambios:
`app/api/orders/[id]/status/route.ts`.

## Verification

1. `npm test` · `npx eslint .` · `npm run build` — exit 0.
2. Con Supabase local: `/reserva/estado?b=<id>` para órdenes paid / cancelled / id basura
   (404). Sin polling en estados terminales (network tab).
3. E2E completo (receta local: `NEXT_PUBLIC_SITE_URL` = túnel https): pago sandbox →
   redirect automático → skeleton → flip a confirmado sin recargar → .ics abre en Calendario
   con hora local correcta → link de Google prellenado.
4. Reduced-motion y VoiceOver (aria-live anuncia el flip).
5. Rama `feat/estado-confirmation` → PR → CI + preview → squash-merge.
