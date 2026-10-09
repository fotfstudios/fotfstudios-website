# Plantillas de WhatsApp (Meta / Kapso)

Las plantillas viven en Meta: el código solo manda el **nombre** y los **parámetros**. Este archivo
es lo que el dueño copia al crearlas en Kapso (WhatsApp → Templates → New) o en WhatsApp Manager.
`src/application/whatsapp/templates.ts` tiene un test de contrato que compara los `{{parámetros}}`
de cada bloque `body` con el catálogo del código: **si se edita una plantilla acá, hay que editarla
en Meta y en el catálogo**, y viceversa. Una plantilla aprobada no se edita en Meta sin re-aprobación.

Para todas:

- **Categoría:** Utility. **Idioma:** Spanish (`es`). **Formato de parámetros:** Named.
- Sin lenguaje promocional ("oferta", "descuento", "promo"): Meta las reclasifica como Marketing.
- Un parámetro no puede ir al inicio ni al final del cuerpo, ni dos parámetros pegados.
- Los ejemplos son obligatorios en la revisión; usar los de cada tabla.
- Botón de URL dinámica: Meta solo acepta `{{1}}` al **final** de la URL.

Ver el diseño en `docs/superpowers/specs/2026-10-02-whatsapp-kapso-design.md`.

---

## Cliente

### `fotf_reserva_confirmada`

Evento `booking_confirmed`. Sale cuando se confirma el pago de una reserva.

```body
Hola {{nombre}}, tu reserva en FOTF Studios está confirmada: {{fecha}}. Total pagado: {{total}}.

Tu código de acceso te llega 10 minutos antes de la sesión, por correo y por acá. Nos vemos en cabina.
```

| Parámetro | Ejemplo |
|---|---|
| nombre | Camila |
| fecha | sábado 4 de octubre, 18:00–20:00 |
| total | $30.000 |

Botón URL (dinámico): texto **Ver mi reserva**, URL `https://www.fotfstudios.cl/reserva/estado?b={{1}}`,
ejemplo `https://www.fotfstudios.cl/reserva/estado?b=3f6c2a1e-0000-4000-8000-000000000000`.

### `fotf_recordatorio_sesion`

Evento `session_reminder`. Sale menos de 24 h antes de la sesión. La fecha va completa, nunca "mañana" (misma regla que el correo).

```body
Hola {{nombre}}, te recordamos tu sesión en FOTF Studios: {{fecha}}.

Dirección: {{direccion}}. El código de acceso te llega 10 minutos antes. Trae tu música en USB.
```

| Parámetro | Ejemplo |
|---|---|
| nombre | Camila |
| fecha | sábado 4 de octubre, 18:00–20:00 |
| direccion | Los Chercanes 78a, Viña del Mar |

Sin botón (las sesiones de cortesía no tienen recibo público).

### `fotf_pin_acceso`

Evento `access_pin`. Sale 10–15 minutos antes de la sesión, cuando el PIN ya está cargado en la cerradura.

```body
Hola {{nombre}}, tu código de acceso para la sesión de hoy a las {{hora}} es {{pin}}.

Márcalo en el teclado de la puerta y entras solo, sin esperar a nadie. Si algo falla, responde a este mensaje.
```

| Parámetro | Ejemplo |
|---|---|
| nombre | Camila |
| hora | 18:00 |
| pin | 482913 |

Sin botón.

### `fotf_pago_pendiente`

Evento `payment_pending`. Sale al crear una reserva manual pendiente de pago.

```body
Hola {{nombre}}, tu hora en FOTF Studios ({{fecha}}) quedó agendada y pendiente de pago: {{total}}.

Paga antes del {{plazo}} o el horario se libera. Datos para transferir:
FOTF Studios SpA
RUT 78.144.716-1
Mercado Pago · Cuenta Vista
N° 1030063139
pagos@fotfstudios.cl

Envía el comprobante respondiendo a este mensaje.
```

| Parámetro | Ejemplo |
|---|---|
| nombre | Camila |
| fecha | sábado 4 de octubre, 18:00–20:00 |
| total | $30.000 |
| plazo | jueves 2 de octubre a las 09:00 |

Botón URL (dinámico): texto **Ver mi reserva**, misma URL que `fotf_reserva_confirmada`.

Los datos de transferencia van fijos (no son parámetros) y salen de `TRANSFER` en `lib/site.ts`.
**Si cambia la cuenta, hay que crear una plantilla nueva** y apuntar el catálogo a ella. Nunca se
ofrece efectivo.

### `fotf_recordatorio_pago`

Evento `payment_reminder`. Sale cuando quedan 24 h o menos para el plazo de pago.

```body
Hola {{nombre}}, tu hora del {{fecha}} en FOTF Studios sigue pendiente de pago ({{total}}).

El plazo vence el {{plazo}}; después el horario se libera. Si ya transferiste, ignora este mensaje.
```

| Parámetro | Ejemplo |
|---|---|
| nombre | Camila |
| fecha | sábado 4 de octubre, 18:00–20:00 |
| total | $30.000 |
| plazo | jueves 2 de octubre a las 09:00 |

Botón URL (dinámico): texto **Ver mi reserva**, misma URL que `fotf_reserva_confirmada`.

---

### `fotf_prueba_curso_movida`

Evento `trial_rescheduled`. Sale cuando el estudio mueve la sesión de prueba del Curso de DJ a otra
hora (`/admin/reservas/[id]` → Mover prueba). La prueba es guiada: no promete código de acceso.

```body
Hola {{nombre}}, movimos tu prueba del Curso de DJ en FOTF Studios. Antes: {{antes}}. Ahora: {{ahora}}.

Te recibimos en la puerta, no necesitas código. Si no puedes venir, respóndenos por acá.
```

| Parámetro | Ejemplo |
|---|---|
| nombre | Camila |
| antes | jueves 8 de octubre, 18:00–19:00 |
| ahora | viernes 9 de octubre, 16:00–17:00 |

Botón URL (dinámico): igual que `fotf_reserva_confirmada`.

## Dueño (`OWNER_WHATSAPP`)

### `fotf_admin_nueva_reserva`

Evento `owner_new_booking`.

```body
Nueva reserva pagada en FOTF Studios: {{cliente}}, {{fecha}}, por {{total}}. Revisa el detalle en el panel.
```

| Parámetro | Ejemplo |
|---|---|
| cliente | Camila Rojas |
| fecha | sábado 4 de octubre, 18:00–20:00 |
| total | $30.000 |

Botón URL (dinámico): texto **Abrir en el panel**, URL `https://www.fotfstudios.cl/admin/reservas/{{1}}`,
ejemplo `https://www.fotfstudios.cl/admin/reservas/3f6c2a1e-0000-4000-8000-000000000000`.

### `fotf_admin_pago_pendiente`

Evento `owner_payment_pending`.

```body
Reserva pendiente de pago creada en FOTF Studios: {{cliente}}, {{fecha}}, por {{total}}. El plazo de pago vence el {{plazo}}.
```

| Parámetro | Ejemplo |
|---|---|
| cliente | Camila Rojas |
| fecha | sábado 4 de octubre, 18:00–20:00 |
| total | $30.000 |
| plazo | jueves 2 de octubre a las 09:00 |

Botón URL (dinámico): igual que `fotf_admin_nueva_reserva`.

### `fotf_admin_cancelacion`

Evento `owner_cancellation`. Solo cuando la reserva se cancela por un reembolso hecho fuera del
panel (desde Mercado Pago); las cancelaciones del panel no avisan.

```body
Reserva cancelada por un reembolso desde Mercado Pago: {{cliente}}, {{fecha}}. Monto reembolsado: {{reembolso}}.
```

| Parámetro | Ejemplo |
|---|---|
| cliente | Camila Rojas |
| fecha | sábado 4 de octubre, 18:00–20:00 |
| reembolso | $30.000 |

Botón URL (dinámico): igual que `fotf_admin_nueva_reserva`.

### `fotf_admin_nuevo_lead`

Evento `owner_new_lead`.

```body
Nuevo contacto en FOTF Studios desde {{origen}}: {{nombre}}, {{contacto}}. Respóndele pronto.
```

| Parámetro | Ejemplo |
|---|---|
| origen | Curso DJ |
| nombre | Camila Rojas |
| contacto | camila@example.com · +56 9 1234 5678 |

Sin botón.

### `fotf_admin_prueba_curso_movida`

Evento `owner_trial_rescheduled`. Sale cuando se mueve una prueba del Curso de DJ desde el panel.

```body
Prueba del curso movida: {{cliente}}. Antes: {{antes}}. Ahora: {{ahora}}. Es guiada, sin PIN.
```

| Parámetro | Ejemplo |
|---|---|
| cliente | Camila Rojas |
| antes | jueves 8 de octubre, 18:00–19:00 |
| ahora | viernes 9 de octubre, 16:00–17:00 |

Botón URL (dinámico): igual que `fotf_admin_nueva_reserva`.

### `fotf_prueba`

Evento `test_ping`. Lo manda el botón "Enviar prueba" de `/admin/whatsapp`.

```body
Prueba de WhatsApp de FOTF Studios del {{fecha}}. Si lees esto, la integración funciona.
```

| Parámetro | Ejemplo |
|---|---|
| fecha | 2 de octubre a las 15:30 |

Sin botón.
