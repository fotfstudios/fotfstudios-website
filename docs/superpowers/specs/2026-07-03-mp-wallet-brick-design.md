# Wallet Brick de Mercado Pago como botón de pago — diseño

- **Date:** 2026-07-03
- **Status:** Design approved
- **Scope:** Integrar `@mercadopago/sdk-react` (Wallet Brick) como botón de pago oficial en
  `/reservar`, con el flujo clásico (redirect a `init_point`) intacto como fallback.

## Context

El flujo usa el patrón redirect (`POST /api/bookings` → `window.location.assign(initPoint)`);
el SDK cliente de MP nunca se integró (`MP_PUBLIC_KEY` sin uso en código). El dueño pidió el
botón oficial Wallet Brick según la doc de Checkout Pro (suma además al score de "Calidad de
integración" de MP).

**Decisiones del dueño:** instalar `@mercadopago/sdk-react` — **excepción sancionada** a la
norma "sin dependencias nuevas" del repo (SDK oficial, pedido explícito); fondo del botón =
`'default'` (azul MP, máximo reconocimiento) vía constante única `BUTTON_BACKGROUND`.

**Restricción dura (verificada):** hold + orden + preference se crean SOLO al submit. El Brick
usa la variante **PreferenceOnSubmit** del SDK (`onSubmit` resuelve el `preferenceId` creado al
click; `redirectMode: 'self'`) — nunca preference anticipada (tomaría holds de visitantes).

**Out of scope:** refresh de disponibilidad tras un 409, CSP, y el comportamiento actual de
orden-huérfana tras un 502 de preference (paridad). Nota: el viejo `MP_PUBLIC_KEY` (jamás
leído por código) se ELIMINÓ de `.env.example` — la única variable es
`NEXT_PUBLIC_MP_PUBLIC_KEY`; borrar `MP_PUBLIC_KEY` de Vercel cuando convenga.

## Componentes

| Archivo | Status | Propósito |
|---|---|---|
| `components/booking/MpWalletButton.tsx` | new | Wrapper cliente del Wallet Brick (init único a nivel módulo, refs estables, skeleton hasta onReady, onError → fallback) |
| `components/booking/useIsDesktop.ts` | new | Hook matchMedia SSR-safe (`null` hasta montar; `64rem` = `lg` de Tailwind v4) |
| `lib/booking-error.ts` | new | `bookingErrorMessage(code)` puro + `BookingRequestError` |
| `lib/booking-error.test.ts` | new | Unit tests (vitest incluye solo `src/**` y `lib/**`) |
| `components/booking/BookingWidget.tsx` | modify | `submit` → `createBookingAndGetPreference` + `walletSubmit`; swap Wallet/clásico por breakpoint |
| `app/api/bookings/route.ts` | modify | + `preferenceId` en la respuesta |
| `src/infrastructure/db/booking-routes.itest.ts` | modify | + assert `preferenceId` |
| `lib/env.ts` · `.env.example` | modify | Documentar `NEXT_PUBLIC_MP_PUBLIC_KEY` |
| `package.json` | modify | + `@mercadopago/sdk-react` (^1.0.7) |

## Diseño técnico (riesgos y mitigaciones)

1. **Gate de montaje** = `payReady = selectedStart !== null && !!email` — NO `canPay` (incluye
   `!submitting`: desmontaría el brick a mitad del submit).
2. **Aislamiento de re-renders** (el widget re-renderiza por tecla): wrapper con `memo`,
   `customization`/`initialization` como constantes de módulo, `onSubmit` estable vía ref (el
   brick captura una función fija que delega en la más reciente).
3. **StrictMode** (`reactStrictMode: true`): `initMercadoPago(key, { locale: "es-CL" })` a
   nivel de módulo (window-guarded), importado con `next/dynamic` `ssr: false` — el chunk del
   SDK + script de MP cargan recién al llegar a `payReady`.
4. **Instancia única**: exactamente un `<Wallet>` montado — panel desktop si
   `isDesktop === true`, barra fija móvil si `false` (hook matchMedia `(min-width: 64rem)`,
   `null` pre-mount → ambos slots muestran el botón clásico → sin hydration mismatch). Cruzar
   el breakpoint re-monta la única instancia (aceptado). API v1.0.7 verificada:
   `customization = { valueProp, customStyle: { buttonBackground } }`, props `onSubmit`
   (`() => Promise<unknown>`, resuelve preferenceId), `onReady`, `onError`, `locale`, `id`.

## Matriz de errores

| Falla | Comportamiento |
|---|---|
| `NEXT_PUBLIC_MP_PUBLIC_KEY` ausente | Brick nunca monta; flujo clásico (degradación elegante, patrón NoopMailer) |
| Script bloqueado / key inválida / caída MP (`onError`) | `walletFailed` → botón dorado clásico en el slot; sin error visible (nada falló para el usuario); `console.error` para diagnóstico |
| Red caída en fetch | `BookingRequestError("network")` → "Error de conexión. Intenta de nuevo."; brick vuelve a idle |
| 409 `slot_taken` / 400 `too_soon` | Mensajes actuales en su posición actual; brick idle |
| 502 preference / 503 | Mensaje genérico; brick idle (orden+hold expiran en 10 min — paridad) |
| Éxito | Brick redirige same-tab (`redirectMode: 'self'`) — paridad con `window.location.assign` |

Verificación empírica pendiente en E2E: que el reject del `onSubmit` devuelva el botón del
brick a idle (si se traba: bump de `key` en el catch para remontar).

## Brand fidelity

El brick es UI de MP (no tematizable a gold) — decisión consciente: azul MP en el momento de
pago maximiza confianza. Botón clásico dorado intacto como fallback. Skeleton existente.
Microcopy "IVA incluido · pago seguro con Mercado Pago" sin cambios.

## Accessibility

Skeleton `aria-hidden` + `sr-only` "Cargando el botón de pago…"; el brick provee su propio
botón accesible; texto de error mantiene posición y `label-sm text-sirena`; sin trampas de
foco en el swap.

## Testing (Vitest)

`lib/booking-error.test.ts`: slot_taken / too_soon (interpola `MIN_LEAD_MINUTES`) / network /
fallback desconocido+null; `BookingRequestError` conserva el código.
`booking-routes.itest.ts`: happy path asegura `preferenceId` truthy.

## Verification

1. `npm test` · `npx eslint .` · `npm run build` — exit 0.
2. `npm run test:integration` local (credenciales sandbox).
3. E2E túnel: slot + email → skeleton → botón azul MP → click → checkout sandbox → pago →
   redirect same-tab → estado confirma. Network: SDK solo carga al `payReady`.
4. Rechazo: slot tomado desde otra ventana → mensaje actual + brick idle.
5. Fallbacks: sin key → clásico E2E completo; key inválida → `onError` → swap.
6. Responsive: brick en barra móvil <64rem / panel ≥64rem; nunca dos instancias.
7. StrictMode dev sin errores de doble montaje.
8. Vercel: `NEXT_PUBLIC_MP_PUBLIC_KEY` en Preview y Production (manual) antes del merge.
9. Rama `feat/mp-wallet-brick` → PR → CI + preview → squash-merge.
