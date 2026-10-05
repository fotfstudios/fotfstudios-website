# Primera campaña en Meta Ads — Curso DJ · sesión de prueba

**Campaña:** `curso-prueba-2026-10` · **Lanzamiento:** viernes 9 oct 2026 · **Presupuesto:** $100.000 CLP/mes
**Estado:** brief aprobado 2026-10-04 · Pixel, GTM y campaña pendientes (se arma en pausa; el dueño publica)

---

## 1. Resumen

Que personas del Gran Valparaíso que quieren aprender a mezclar pidan una **sesión de prueba de $19.990**
en equipos Pioneer de club.

- **Objetivo principal:** **20 solicitudes del curso en 4 semanas** (`course_lead_submit`), costo por
  lead (CPL) ≤ $5.000 CLP.
- **Secundarios:** ≥ 8 sesiones de prueba realizadas · ≥ 2 inscripciones (un Individual paga 2,5 meses
  de pauta) · una audiencia del Pixel para remarketing de la sala más adelante.

La conversión en `/curso-dj` es el **formulario de solicitud** (`#reserva`), no una reserva pagada: el
dueño responde por WhatsApp y agenda la prueba.

## 2. Audiencia

- **Principal:** 18–40 años, vive a ~25 km de Viña del Mar (Valparaíso, Quilpué, Villa Alemana, Concón,
  Reñaca). Le gusta la música electrónica, va a clubes y festivales, alguna vez pensó “me gustaría
  aprender a mezclar”, pero no tiene equipos ni sabe por dónde partir. Le frena verse principiante, el
  costo de los equipos y no tener quien le enseñe 1:1. Vive en Instagram.
- **Secundaria (remarketing, semana 3+):** visitantes de `/curso-dj` y `/guia-dj`, gente que interactuó
  con @fotfstudios.
- **Configuración del conjunto de anuncios:** público Advantage+ con sugerencias (intereses: DJ, Pioneer
  DJ, rekordbox, Boiler Room, techno, house, producción musical). Edad 18–40. Ubicación: Viña del Mar
  + 25 km, “personas que viven en esta ubicación”. Sin segmentar por género.

## 3. Mensajes

**Mensaje central:** “Aprende a mezclar desde cero, uno a uno, en equipos Pioneer de club. Prueba una
hora por $19.990.”

| Mensaje de apoyo | Texto (fuente) |
|---|---|
| Sin equipos ni experiencia | “Solo traes tus audífonos y un USB con tu música.” (FAQ) |
| La prueba no se pierde | “Se descuenta completa del curso si te inscribes dentro de 7 días.” (hero) |
| Equipos reales | 2× Pioneer XDJ-1000MK2, DJM-450, monitores Pioneer DJ VM-50, sala aislada acústicamente |
| A tu ritmo | 1:1, horario a tu medida · “Precio de lanzamiento · primeros 10 alumnos” |

**Prueba social:** reseña 5★ de Martín en Google (cita literal, sin corregir, como en `lib/curso-content.ts`):

> “Hace tiempo queria probar algo asi, y la experiencia que ofrece FOTF Studios, superó todas mis
> expectativas. Tanto el lugar, la cercania, lo conceptual y la práctica. Verdaderamente una experiencia
> increíble y la recomendaría a todo quien busque aprender.”

**Tono por ubicación:** Reels/Stories: frases cortas, segunda persona, una idea por cuadro. Feed: línea
principal + 2 puntos + llamado a la acción. Sirena solo si el titular es “primeros 10 alumnos” (urgencia
real); nunca decorativo.

## 4. Estructura de la campaña

Una campaña, un conjunto de anuncios, 2–3 anuncios. Es lo correcto para ~$3.300/día.

| Campo | Valor |
|---|---|
| Objetivo | **Clientes potenciales (Leads)** → ubicación de conversión: Sitio web → evento **`Lead`** del Pixel |
| Presupuesto | $3.300 CLP diarios, sin fecha de término (presupuesto a nivel de conjunto) |
| Ubicaciones | Advantage+ (Reels, Feed y Stories de IG y FB) |
| URL | `https://fotfstudios.cl/curso-dj` |
| Parámetros de URL | `utm_source=meta&utm_medium=paid_social&utm_campaign=curso-prueba-2026-10&utm_content={{ad.name}}` |
| Botón | “Más información” |
| Titulares | “Sesión de prueba · $19.990” / “Aprende a mezclar desde cero” |

Con este presupuesto la campaña quedará en **“aprendizaje limitado”** (Meta pide ~50 leads/semana para
salir). Es esperable: **no** cambiar a objetivo Tráfico ni editar el conjunto para “salir” de ahí.

## 5. Medición — Meta Pixel vía GTM (sin código; obligatorio antes de lanzar)

Regla del repo: todo tag va por GTM (`GTM-WCC3V22R`), nunca un snippet en el código.

1. **Events Manager:** crear el Pixel “FOTF Studios” en el Business Manager existente; anotar el ID.
2. **GTM:** importar la plantilla de la comunidad “Facebook Pixel”. Tag **Meta Pixel — PageView** en
   todas las páginas, con consentimiento adicional requerido `ad_storage`.
3. Tag **Meta Pixel — Lead**: evento `Lead`, activador Custom Event `course_lead_submit` (ya lo empuja
   el formulario). Parámetros: `content_name = course_lead`, `content_category = {{dlv - plan}}`.
4. Tag **Meta Pixel — ViewContent** en rutas `^/curso-dj` (para la audiencia de remarketing).
5. Opcional: `CompleteRegistration` en `guide_lead_submit`, como evento aparte, para que la campaña
   optimice solo con leads del curso.
6. Vista previa de GTM en producción → “Probar eventos” en Events Manager muestra PageView + Lead →
   publicar la versión **“v13 Meta Pixel curso”**.
7. En el conjunto de anuncios, evento de conversión `Lead` de este Pixel.

**Consentimiento:** el Pixel solo mide a quien acepta el banner. Meta va a **subcontar** los leads, así
que el CPL reportado será peor que el real. **La fuente de verdad es la lista de solicitudes del admin.**
Comparar ambos cada semana.

## 6. Piezas

| Pieza | Formato | Prioridad | Fuente |
|---|---|---|---|
| Reel A | video 9:16, 15–20 s, subtítulos quemados | Imprescindible (puede sumarse después del lanzamiento) | `public/video/curso-clase.mp4` + material crudo |
| Carrusel B | 4 × 4:5: equipos, cabina, cita de Martín, precio + CTA | Imprescindible | `public/photos/curso-*.jpg` |
| Story C | 9:16 estático: “¿Siempre quisiste aprender a mezclar?” + precio | Deseable | mismas fotos |
| Texto principal ×2 | ≤ 125 caracteres antes de “ver más” | Imprescindible | §3 |
| Titulares ×2 | ver §4 | Imprescindible | §4 |
| Landing | `/curso-dj` | Existe | revisar formulario en móvil y precio visible arriba |

Toda foto con texto encima lleva scrim. Tipografía y colores del sistema de `/curso-dj`.

## 7. Calendario

| Cuándo | Qué | Dónde | Estado |
|---|---|---|---|
| Lun 5 oct | Pixel + tags GTM + eventos de prueba | Events Manager / GTM | |
| Lun 5 oct | Campaña armada **en pausa**; método de pago cargado (dueño) | Ads Manager | |
| Mar 6–Mié 7 | Carrusel B y Story C | — | |
| Mar 6–Mié 7 | Reel A (opcional para el lanzamiento) | edición del dueño | |
| Jue 8 | Link de la bio de IG → `/curso-dj?utm_source=instagram&utm_medium=social&utm_campaign=bio` | Instagram | |
| **Vie 9** | **Lanzamiento**; envío de prueba real del formulario → `Lead` en Events Manager | Ads Manager | |
| Semana 1 | Mirar a diario gasto, CPM, CTR, leads; responder leads por WhatsApp en < 1 h | Ads Manager / admin | |
| Semana 2 | Primera lectura: pausar el anuncio peor si CTR < 0,6 % con ≥ 3.000 impresiones | Ads Manager | |
| Semana 3 | Conjunto de remarketing ($1.000/día del mismo presupuesto): ViewContent 30 días, excluyendo leads; creatividad = testimonio | Ads Manager | |
| Semana 4 | Comparar con las metas; escalar (+20 %/semana máx.) o pasar a una campaña de la sala | — | |

**No editar el conjunto de anuncios durante los primeros 7 días:** cada edición reinicia el aprendizaje.

## 8. Metas y métricas

| KPI | Meta (4 semanas) | Dónde |
|---|---|---|
| Leads | ≥ 20 | admin (verdad) + Events Manager + GA4 |
| CPL | ≤ $5.000 CLP | Ads Manager |
| CTR (enlace) | ≥ 1,0 % Reels · ≥ 0,8 % feed | Ads Manager |
| CPM | ≤ $4.000 CLP (control) | Ads Manager |
| Conversión de la landing | ≥ 4 % de las visitas | Leads ÷ visitas a la página de destino |
| Pruebas realizadas | ≥ 8 | admin |
| Inscripciones | ≥ 2 | admin |

### Columnas a configurar en Ads Manager

Partir del preset “Rendimiento y clics” y personalizar (guardarlo como conjunto de columnas):

- **Entrega:** importe gastado · alcance · frecuencia (> 3/semana = renovar creatividad) · CPM
  (referencia Chile $2.000–5.000).
- **Atención:** CTR (enlace), **no** “CTR (todos)” · CPC (enlace), esperable $150–400 · tasa de gancho
  (reproducciones de 3 s ÷ impresiones; < 25 % = el primer cuadro no funciona) · ThruPlays.
- **Llegada:** visitas a la página de destino vs clics en el enlace (diferencia < 30 %; si es mayor, la
  página carga lento en móvil) · costo por visita.
- **Resultado:** resultados (`Lead`) · costo por resultado · conversión (leads ÷ visitas).
- **Diagnóstico (leer, no perseguir):** clasificación de calidad, de interacción y de conversión.
  “Por debajo del promedio” en calidad = la pieza; en conversión = la landing.

**Trampas:** métricas de vanidad (me gusta, interacciones) y juzgar antes de tiempo. Con menos de ~3.000
impresiones por anuncio el CTR es ruido; con menos de ~10 leads, el CPL también.

**Reporte:** vistazo diario la semana 1; tabla semanal agregada a este documento las semanas 2–4.

## 9. Presupuesto

- Pauta: $100.000 CLP ($3.300/día × 30). Producción: $0 (material propio).
- Si el CPL baja de $3.000 en la semana 2, subir el diario 20 % por semana, nunca más.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cuenta publicitaria nueva: límites de gasto o anuncios rechazados | Armar la campaña el lunes en pausa para que la revisión ocurra antes del viernes; cargar el pago temprano |
| Aprendizaje limitado, datos ruidosos | Un conjunto, sin ediciones 7 días; decidir por CTR y leads del admin |
| Seguimiento lento mata la conversión | Responder por WhatsApp en < 1 h en horario; el aviso por correo ya existe |
| El consentimiento subcuenta | Comparar Events Manager vs admin cada semana |
| Fatiga de la creatividad | Renovar el Reel en la semana 3 con material de las primeras pruebas (con permiso) |

## 11. Quién hace qué

**Claude (extensión de Chrome), todo queda en pausa:** Pixel en Events Manager, tags y publicación en
GTM, Carrusel B y Story C, la campaña completa en Ads Manager, y este documento.

**Claude se detiene y entrega en:** método de pago, límites de gasto, verificación del negocio o de
identidad, 2FA, avisos de políticas de Meta y el botón **Publicar**.

**Dueño:**
1. Sesión iniciada en Chrome en GTM (Google) y Meta Business Suite, con admin en la página, la cuenta
   publicitaria y el Pixel.
2. Tarjeta (CLP) en la cuenta publicitaria antes del viernes.
3. Reel A (opcional para el lanzamiento).
4. Revisar la campaña en pausa y publicar el viernes; responder leads en < 1 h.
5. Semana 4: escalar, o segunda campaña para la sala (requiere evento `purchase` en `/reserva/estado`).

## 12. Opcional: UTM en las solicitudes del curso

PR aparte (`feat/curso-leads-utm`) para guardar `utm_source`/`utm_campaign`/`utm_content` en cada
solicitud y verlos en el admin, reutilizando `readUtm` de `lib/guia-utm.ts`. Lleva migración, así que
pasa por la aprobación de producción. **No bloquea el lanzamiento:** GA4 ya atribuye `course_lead_submit`
por los UTM de la sesión.

## Registro

| Fecha | Hito |
|---|---|
| 2026-10-04 | Brief aprobado |
