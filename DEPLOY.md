# DEPLOY.md — Despliegue y operación de FOTF Studios

Runbook del proceso de release. Fuente única para *cómo llega el código y el
esquema a producción*, cómo revertir, y qué configuración de prod vive fuera de
git. Complementa la sección "Git & deployment workflow" de [CLAUDE.md](CLAUDE.md).

## Entornos

| Entorno | Dónde | Base de datos | Para qué |
|---------|-------|---------------|----------|
| **local** | tu máquina (`npm run dev` + Supabase local) | Supabase local (puertos `544xx`) | desarrollar y **probar todo** (reservas, admin, pagos vía túnel) |
| **preview** | Vercel, por PR | **ninguna** (sin env de Supabase) | validar que *compila* y que el marketing renderiza — **no** ejercita DB/admin/pagos |
| **production** | Vercel → `https://fotfstudios.cl` | Supabase remoto | el sitio real |

Regla de oro (ver [CLAUDE.md](CLAUDE.md) · *Local-first testing*): **todo se prueba
y depura local antes de prod.** A prod solo va lo ya verificado localmente.

## El pipeline de una release

```
rama feat/… → PR → CI (lint & build + integration + CodeQL) → squash-merge a main
   ├─ Vercel: auto-deploy del CÓDIGO a producción
   └─ GitHub Actions job `migrate`: aplica migraciones a la DB de prod
      (tras aprobación de 1 clic en el Environment `production`)
```

1. **Rama por cambio** (`feat/…`, `fix/…`, `chore/…`), commits atómicos (Conventional Commits).
2. **PR** → revisar el **Preview de Vercel** (solo build/marketing) → esperar los checks.
3. **Checks requeridos** (`.github/rulesets/main.json`): `lint & build` + `integration tests`.
4. **Squash-merge** a `main`. Esto dispara en paralelo:
   - **Vercel** despliega el código a prod (cada push a `main` → prod).
   - El job **`migrate`** (`.github/workflows/ci.yml`) aplica las migraciones pendientes.
5. Borrar la rama.

## Migraciones a producción

Las migraciones en `supabase/migrations/` son la **fuente de verdad** del esquema.
El job `migrate` corre `supabase db push` contra la DB de prod, pero:

- solo en **push a `main`**, y solo si `lint & build` + `integration tests` pasaron;
- detrás del **GitHub Environment `production`** con **revisor requerido** → se
  **pausa esperando un clic de aprobación** antes de escribir en la DB;
- primero imprime un **`--dry-run`** (el plan) y luego aplica.

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
