# DEPLOY.md — Despliegue y operación de FOTF Studios

Runbook del proceso de release. Fuente única para *cómo llega el código y el
esquema a producción*, cómo revertir, y qué configuración de prod vive fuera de
git. Complementa la sección "Git & deployment workflow" de [CLAUDE.md](CLAUDE.md).

## Entornos

| Entorno | Dónde | Base de datos | Para qué |
|---------|-------|---------------|----------|
| **local** | tu máquina (`npm run dev` + Supabase local) | Supabase local (puertos `544xx`) | desarrollar y **probar todo** (reservas, admin, pagos vía túnel) |
| **preview** | Vercel, por PR | **Supabase staging** (proyecto *free* aparte, mismo org) | revisar el PR contra una DB real (reservas/admin); el webhook de pago aún requiere túnel local |
| **production** | Vercel → `https://fotfstudios.cl` | Supabase **producción** (remoto) | el sitio real |

Regla de oro (ver [CLAUDE.md](CLAUDE.md) · *Local-first testing*): **todo se prueba
y depura local antes de prod.** A prod solo va lo ya verificado localmente.

## El pipeline de una release

```
rama feat/… → PR → CI (lint & build + integration + CodeQL) → squash-merge a main
   ├─ Vercel: auto-deploy del CÓDIGO a prod (env de prod vía integración nativa Supabase↔Vercel)
   └─ GitHub Actions:  migrate-staging (canario → DB de STAGING)
                         → aprobación de 1 clic (Environment `production`)
                         → migrate (→ DB de PROD)
```

1. **Rama por cambio** (`feat/…`, `fix/…`, `chore/…`), commits atómicos (Conventional Commits).
2. **PR** → revisar el **Preview de Vercel** (ahora con **DB de staging**: reservas/admin) → esperar los checks.
3. **Checks requeridos** (`.github/rulesets/main.json`): `lint & build` + `integration tests`.
4. **Squash-merge** a `main`. Esto dispara en paralelo:
   - **Vercel** despliega el código a prod (cada push a `main` → prod).
   - El job **`migrate`** (`.github/workflows/ci.yml`) aplica las migraciones pendientes.
5. Borrar la rama.

## Migraciones a producción

Las migraciones en `supabase/migrations/` son la **fuente de verdad** del esquema. En cada
push a `main`, tras `lint & build` + `integration tests`, se aplican en **dos pasos encadenados**:

1. **`migrate-staging`** (canario) — `supabase db push` contra la DB de **staging**. No está
   gateado (es non-prod), pero corre **antes** que prod: si una migración falla, el job de prod
   ni siquiera se ofrece para aprobación. Usa el Environment `staging`.
2. **`migrate`** (prod) — solo si el canario pasó (`needs: [verify, integration, migrate-staging]`);
   detrás del **GitHub Environment `production`** con **revisor requerido** → se **pausa
   esperando un clic de aprobación** antes de escribir en la DB. Primero imprime un
   **`--dry-run`** (el plan), aplica, y al final loguea `supabase migration list --linked`
   (paridad del ledger local vs remoto).

> **⚠️ Guardrail:** la integración nativa de GitHub del proyecto de prod debe mantener
> **«Deploy to production» APAGADO**. Si se enciende, Supabase aplicaría migraciones por su
> cuenta (en push a `main`) **fuera** del gate de aprobación → doble vía. **GitHub Actions es
> la única vía autoritativa** de migraciones.

### ⚠️ Regla expand/contract (obligatoria)

El código nuevo y las migraciones se despliegan **casi a la vez** (Vercel + Actions
en paralelo). Para que sea seguro, **toda migración debe ser retrocompatible**: el
código *actualmente vivo* tiene que seguir funcionando en el instante en que la
migración se aplica.

- ✅ Agregar tabla/columna *nullable* o con default; agregar índice; agregar función.
- ❌ Renombrar/eliminar columna en uso, `NOT NULL` sin default, cambio de tipo
  incompatible — en un solo paso.
- Para un cambio destructivo: hacerlo en **dos releases** — (1) *expand*: agregar lo
  nuevo y migrar lecturas/escrituras; (2) *contract*: en un PR posterior, eliminar lo
  viejo una vez que ya nada lo usa.

### Setup una sola vez (dueño)

En **Settings → Environments** del repo:
1. Crear el Environment **`production`** y agregarte como **required reviewer**.
2. Agregar estos **secrets del Environment** (scoped a `production`, no repo-wide):
   - `SUPABASE_ACCESS_TOKEN` — personal access token (dashboard → Account → Tokens)
   - `SUPABASE_DB_PASSWORD` — password de la DB de producción
   - `SUPABASE_PROJECT_ID` — project ref de producción

## Staging (entorno *free* para previews con DB real)

Un **segundo** proyecto Supabase *free* en el mismo org (`jpifmnnjkthybjkcvmiw`), para que los
**Preview de Vercel** corran contra una base real (reservas/admin/pagos-sandbox) antes de prod.
Es el modelo canónico *local → staging → prod* de la guía **Managing Environments**, adaptado a
trunk-based: staging recibe las migraciones **en el merge a `main`** (canario), justo antes que
prod. No usa Branching (Pro): son **dos proyectos independientes**.

### Setup una sola vez (dueño) — staging

1. **Crear el proyecto staging** en el mismo org, región `sa-east-1`, **Postgres 17** (igual que
   prod). En plan free, staging + prod = el máximo de **2 proyectos activos** por org.
2. **GitHub → Settings → Environments → `staging`** (sin revisor requerido), con secrets (mismos
   *nombres* que `production`, *valores* de staging):
   - `SUPABASE_ACCESS_TOKEN` — el mismo token de cuenta sirve para ambos proyectos
   - `SUPABASE_DB_PASSWORD` — password de la DB de **staging**
   - `SUPABASE_PROJECT_ID` — project ref de **staging**
3. **Vercel → Settings → Environment Variables, scope = Preview** (a mano): la integración nativa
   Supabase↔Vercel es **1:1 por proyecto de Vercel** y prod ya ocupa esa conexión (conectar
   staging falla con *"repository already has an installed connection to a project"*). Así que las
   vars de staging se ponen **a mano**, apuntando a staging, con los **nombres exactos** de
   [lib/env.ts](lib/env.ts): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `NEXT_PUBLIC_BOOKING_ENABLED=true`, MP **sandbox** +
   `NEXT_PUBLIC_MP_PUBLIC_KEY`, y opcional `RESEND_API_KEY`/`CRON_SECRET`. (El scope **Production**
   lo maneja la integración nativa y no se toca — es Production-only, sin solape.) **Prueba de
   aceptación:** un deploy de preview pasa `assertBaseEnv()`.
4. **Auth de staging** (dashboard, a mano) — Site URL + Redirect URLs deben incluir los dominios
   de preview de Vercel, **scopeados al proyecto**: `https://fotfstudios-website-*.vercel.app/**`
   (el `/**` ya cubre `/auth/callback?next=`). NO usar `https://*.vercel.app/**`: aunque hace
   match (el `-` no separa), habilita como destino de redirect a *cualquier* app en `vercel.app`
   (open redirect). Misma clase de config que la checklist de prod (abajo).
5. **Seed inicial (una vez)** — `db push` aplica migraciones pero **no** `seed.sql`. Correr
   `seed.sql` contra staging a mano (SQL editor / `psql`), ajustando el email del super-admin.
6. **No conectar** integraciones nativas de staging: ni **Vercel** (1:1, la tiene prod) ni
   **GitHub** (las migraciones van por Actions `migrate-staging`, para preservar el orden canario).

### Límites del plan free (tenerlos presentes)

- **2 proyectos activos por org** → staging + prod lo llenan; no queda lugar para un tercero free.
- **Los proyectos free se pausan tras ~7 días inactivos** → si staging se pausa, `migrate-staging`
  falla hasta restaurarlo desde el dashboard (un merge frecuente lo mantiene despierto).
- **Sin aislamiento por-PR**: todos los previews comparten la única DB de staging (el aislamiento
  por-PR es Branching = Pro). Es **descartable**: re-seedear/recrear si se ensucia o deriva.
- Staging **no** tiene PITR/backups — da igual, es descartable.

## Config de prod que vive FUERA de git (espejar a mano)

El `supabase/config.toml` solo configura el stack **local**. En producción, estos
ajustes viven en el **dashboard de Supabase** y hay que mantenerlos a mano:

1. **Auth → habilitar signups** (el toggle de `config.toml` solo afecta local).
2. **Redirect URLs**: confirmar el wildcard `https://www.fotfstudios.cl/**` (cubre
   `?next=`). Sin él, el magic-link cae al home tras el login.
3. **Site URL** de prod = `https://www.fotfstudios.cl`.
4. **Templates de email** (Magic Link + Confirm signup) reescritos en es-CL neutro.
5. **SMTP propio** (Resend) o aceptar el límite por defecto (~2 emails/h) en soft launch.

> El detalle de esta checklist nació en
> [docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md](docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md).

## Variables de entorno

- Contrato único: [lib/env.ts](lib/env.ts). Nombres y guía en [.env.example](.env.example).
- **Base (4, fatales al arrancar):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Recomendadas en prod (no fatales, degradan en silencio):** `CRON_SECRET`,
  `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`, `MP_ACCESS_TOKEN`,
  `MP_WEBHOOK_SECRET`, `NEXT_PUBLIC_MP_PUBLIC_KEY`. Si faltan en producción,
  `instrumentation.ts` loguea **un aviso** al arrancar (no tumba el deploy).
- Las `NEXT_PUBLIC_*` se **incrustan en el build**: cambiarlas en Vercel requiere
  **redeploy**, no solo editar la env var.
- Los secrets viven en **Vercel** (por entorno) y en el Environment `production`
  de GitHub (para migraciones). Nunca en git.

## Rollback

### Código (Vercel — instantáneo)
Vercel → proyecto → **Deployments** → elegir el último deploy bueno →
**Promote to Production** (Instant Rollback). No requiere rebuild.

### Base de datos (migraciones = forward-only)
No hay *down-migrations*. Para revertir un cambio de esquema:
1. Escribir una **nueva migración** que deshaga/corrija el cambio (expand/contract).
2. Si el código ya desplegado depende del esquema, **primero** hacer rollback del
   código (arriba), **luego** aplicar la migración correctiva.
3. En un incidente grave, restaurar desde el **PITR/backup** de Supabase (dashboard).

> Por eso la regla expand/contract importa: si las migraciones son retrocompatibles,
> un rollback de código no choca con el esquema ya aplicado.

## Referencias

- [CLAUDE.md](CLAUDE.md) — guía del repo, comandos, guardrails de marca.
- [.github/workflows/ci.yml](.github/workflows/ci.yml) — CI + job `migrate`.
- [.github/rulesets/main.json](.github/rulesets/main.json) — protección de `main`.
- [vercel.json](vercel.json) — build config + crons + `ignoreCommand`.
