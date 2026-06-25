# `infrastructure/`

Adaptadores que implementan los ports de `application`. Única capa con IO/SDKs:
`db/` (Supabase: clientes anon/server/service + repos), `payments/mercadopago`, `email/resend`,
`tax/` (ManualSiiAdapter → luego OpenFacturaAdapter), `access/` (manual → luego Yale). Se llena por PR.
