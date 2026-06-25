# `src/` — plataforma de reservas (arquitectura hexagonal ligera)

Capas con dependencias en un solo sentido (`domain` ← `application` ← `infrastructure` / `app`):

- **`domain/`** — lógica pura de negocio (precio, agenda, dinero). Sin Next, sin Supabase, sin
  IO. Determinista y testeable. No importa ninguna otra capa.
- **`application/`** — casos de uso (checkout, holds, confirmar pago, cancelar) y los **ports**
  (interfaces: `PaymentGateway`, `Mailer`, `TaxDocumentService`, `AccessCodeProvider`, repos).
  Usa `domain` + interfaces; **no** importa infraestructura concreta.
- **`infrastructure/`** — adaptadores que implementan los ports (Supabase, Mercado Pago, Resend,
  SII, acceso). Única capa que toca IO/SDKs externos.
- **`composition.ts`** — composition root: ensambla aplicación + infraestructura. `app/` importa
  desde aquí.

Los límites se fuerzan con `no-restricted-imports` en `eslint.config.mjs`.
