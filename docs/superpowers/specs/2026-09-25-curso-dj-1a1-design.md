# Curso de Iniciación DJ 1:1 — Offer, Pricing & Curriculum Design

_Date 2026-09-25 · brainstormed and approved with the owner · supersedes the course rung of
`2026-08-17-services-restructure-design.md` · builds on `docs/audits/2026-08-17-services-pricing-audit.md`_

## 1. Context & decisions

The public course was paused on 2026-09-25 (PR #219, `CURSO_ABIERTO = false` in `lib/flags.ts`)
to be redefined. The old product was a **group cohort** — 6 seats, 4 × 2h sessions shared by the
whole "generación", 4h of practice, a recorded final set — at $79.990 dúo / $139.990
individual, which the August audit priced at −49% against its own à-la-carte value ($273.806).
Nobody paid that price before the pause, so it carries no market signal.

The new product is a **1:1 personalized course** with a dúo option, priced from Chilean market
data and from FOTF's own economics so that it still works once DJ instructors are hired.

| Decision (owner, 2026-09-25) | Value |
|---|---|
| Format | **1:1 (individual) + dúo** (two friends share instructor and cabin). No group cohort. |
| Instructor pay when hiring | **$15.000 bruto per class hour**; while the owner teaches, that share is owner income |
| Length | **6 sessions × 1.5h = 9h of class**, weekly by default, rolling start |
| Scheduling | **Any open day/time**, one flat price (no peak surcharge) |
| Practice | **6h of free practice per seat** (1h per week), existing practice-hours mechanism |
| Final deliverable | Set final recorded in audio + video during session 6 |
| Fixed cost | Rent **$190.000/month** (only fixed cost given) |

Principles carried over from the Journey Ladder: prices end in .990; the course is the beginner
entry rung (prueba → curso → Pack Egresado → sala por hora); dúo must out-yield individual per
cabin-hour; nothing is priced below what a hired instructor plus a room that still earns its
pack rate would require.

## 2. Market research (verified 2026-09-25)

[F] = page read · [S] = search snippet only (page blocked). All CLP, no conversion needed.

| Provider | City | Format | Hours | Total | CLP/h |
|---|---|---|---|---|---|
| The Loft Music Academy — DJ Profesional Personalizado [F] | Providencia | 1:1 in person | 12 × 2h = 24h | $600.000 (3 × $200.000; 5% off paid in full; no matrícula) | **$25.000** — certificate, recorded demo set, clinics, showcase slot |
| The Loft — Personalizado Sub-16 [F] | Providencia | 1:1 | 12 × 1.5h = 18h | $450.000 | $25.000 |
| Estudio -1 — 1:1 mensual [F] | Santiago | 1:1 | 4 classes (8h) + 4 practice sessions in their room | $190.000 | $23.750 per class-h |
| Estudio -1 — 1:1 3 meses [F] | Santiago | 1:1 | 12 × 2h | $415.000 | $17.292 |
| Estudio -1 — grupal 3 meses [F] | Santiago | group | 24h | $315.000 | $13.125 |
| DJ School Chile — Profesional Inicial [F, via Emagister] | Providencia | group theory + 1:1 practice | 36h | $360.000 (IVA exento; 3 cuotas sin interés; 5% transferencia) | $10.000 |
| Academia Audiomusica [F] | Ñuñoa | small group, 45–60 min | 4 / 12 classes | $90.000 / $230.000 | ≈ $22.500–30.000 per contact-h |
| Technicals DJ Academy / Colegio DJ [F] | **Viña del Mar** | 1:1 "100% personalizado", **1.5h** sessions, ends with a recorded mixtape | — | class price unpublished; practice booth **$40.000 / 2h ($20.000/h)** | — |
| Escuela Moderna de Música — Beats Modernos [F] | **Viña del Mar** / Vitacura | group, Ableton-based, 15+ | 8 weeks, 36h + 22h self-study | unpublished | — |
| Casa Sonido — DJ Esencial Online [S] | online | online | — | $200.000 launch price | — |
| Superprof "mezcla DJ" Chile [S] | national, 1.029 tutors | freelance 1:1, 80% online | per hour | — | avg **$15.035**; Santiago $13.717; "ciclo básico" $11.678; top listings $25.000; Viña $15.000 (in person) / $5.000 (online); 98% offer the first class free |
| Tusclasesparticulares [F] | Santiago | freelance 1:1 | per hour | — | avg $11.000 |

**Norms.** 2h class weekly at Santiago schools; 1.5h in Viña (Technicals) and for teens; 12
sessions over 3 months is the school standard, 4-session monthly packs exist (Estudio -1); 3
cuotas sin interés on card; 5% off transfer; no matrícula; a recorded final set and a
certificate are the standard deliverables; Pioneer + Rekordbox everywhere except Escuela Moderna.

**Curriculum modules schools advertise.** Gear (CDJ/XDJ + DJM), rhythm and counting,
beatmatching by ear without SYNC, EQ and transitions, harmonic mixing, effects, Rekordbox and
USB preparation, set building, a recorded demo as the exam, DJ marketing (advanced), vinyl and
scratch (advanced).

**Instructor pay.** Nothing published for DJ teachers specifically. Proxies: freelance rates
tutors charge ($11.000–15.000/h avg); Dirección del Trabajo "hora cronológica docente"
$19.992–21.034 (schools); private tutors in general $10.500–15.750/h. Plausible contract range
**$10.000–20.000 per class hour**. Owner chose $15.000.

**Competitor rooms.** Technicals (Viña) $20.000/h; Estudio -1 (Santiago) $9.000/h, 8h pack
$6.250/h; band rehearsal rooms in Santiago $9.000–13.000/h.

Sources: music-academy.cl (dj-profesional-personalizado, -sub-16) · estudiomenosuno.com ·
emagister.cl/dj-profesional-inicial-cursos-2806456.htm · djschool.cl/cursos ·
academiaaudiomusica.cl/curso-de-dj · colegiodj.org · emoderna.cl/cursos/dj ·
superprof.cl/clases/mezcla-dj/chile · tusclasesparticulares.cl/profesores/dj/santiago ·
casasonido.cl/cursos · cazotte.cl · ensayando.cl · chiletrabajos.cl/sueldos/profesor/musica ·
dt.gob.cl/portal/1628/w3-article-61527.html.

Gaps: Technicals' class price (ask them directly — the most relevant local comparable); Escuela
Moderna's price; DJ School Chile's price on its own site.

## 3. FOTF economics

- Room, IVA included (`lib/pricing.ts`): valle $9.990/h (Mon–Fri open → 17:00) · punta semana
  $14.990/h (Mon–Thu 17:00 → close) · punta finde $19.990/h (Fri 17:00 → Sun close). Volume
  −10/−15/−20% at 2/3/4h, room only. Open 93h/week: valle 40 · punta semana 20 · punta finde 33.
  Net of IVA: valle $8.395/h, punta semana $12.597/h, punta finde $16.798/h.
- `GUIDED_RATE = 14990`/h — the existing "DJ next to you" add-on is already the market's
  instructor share: valle room + guided = **$24.980/h**, The Loft's 1:1 rate to the peso.
- Packs 8h $67.990 ($8.499/h) and 12h $95.990 ($7.999/h, net $6.722); `PACK_EGRESADO` 5h valle
  $39.990 within 90 days; audio+video add-on $39.990.
- The course is billed as an **IVA-exempt educational service** (`COURSE_IVA_EXEMPT = true` in
  `src/domain/course/course.ts`) → list price = net. The trial is room time and carries IVA.
- Loyalty points: the course neither earns nor accepts points (unchanged).
- **Rent $190.000/month** over ≈ 403 open hours a month (93h × 4.33) = **≈ $470 per open
  hour**; ≈ $7.000 allocated to a 15-room-hour individual enrollment. The room's cost floor per
  hour (rent + electricity) is well under $1.000; every lens above that is opportunity cost,
  which only binds when the calendar is busy.
- **Mercado Pago Chile**, Checkout Pro / link de pago: **3.19% + IVA = 3.80%** effective with
  "dinero al instante"; **2.89% + IVA = 3.44%** with release "en 10 días"
  (mercadolibre.cl/ayuda/33399 via search excerpt, corroborated by comocobro.cl 2026-06 and
  wise.com). Confirm in the account's "Comisiones y cuotas" panel.
- **Retención boleta de honorarios: 15.25% in 2026**, 16% in 2027, 17% in 2028
  (sii.cl, Ley 21.133 schedule).
- MP "cuotas sin interés" **seller surcharge for Chile could not be verified** (every
  mercadopago.cl help page returned 403; the only concrete table found is Argentina's). Treated
  as an unknown parameter `s`, see §5.

## 4. Pricing model

### 4.1 Cost lenses per enrollment

Individual = 9 class-h + 6 practice-h = 15 room-h. Dúo cabin = 9 class-h + up to 12 practice-h
(6 per seat booked separately, worst case) = up to 21 room-h.

- `fee = 3.80% × price` (immediate release; conservative)
- `instructor = 9h × $15.000 = $135.000` per cabin, individual or dúo
- Blended class-hour opportunity **$12.490/h** = 60% valle + 30% punta semana + 10% punta finde.
  Rationale: in a rolling 1:1 model FOTF, not the student, owns the calendar; beginners are
  mostly workers and students, so weekday evenings dominate; punta finde is the room's
  best-selling window and should be capped at ≈ 10% of class slots by policy. Ceiling for
  reference: pure time-weighted list blend over the 93 open hours = $14.614/h. This blend is
  list (IVA inside), so it overstates true net opportunity by 19% — deliberately conservative.
- Practice **$6.000/h** (assumption) ≈ 90% of the net 12h-pack rate; practice is redeemable only
  in otherwise-empty slots, so the chance a practice hour displaces a paid rental is well
  below 1. Sensitivity: at $8.000/h add $12.000 per individual, $24.000 per dúo cabin.
- Recording (A+V, session 6): retail value $39.990 in the value stack, ≈ $0 cash cost.

| Lens (ex-fee) | Individual, hired DJ | Individual, owner | Dúo cabin, hired | Dúo cabin, owner |
|---|---|---|---|---|
| (a) Cash / marginal | $135.000 | $0 | $135.000 | $0 |
| (b) Full opportunity: class 9h × $12.490 = $112.410 + practice × $6.000 | **$283.410** | $148.410 | **$319.410** | $184.410 |
| (c) Valle only: class 9h × $9.990 = $89.910 + practice | $260.910 | $125.910 | $296.910 | $161.910 |

Reading: lens (b) is not clearable by any realistic price with a hired DJ — it assumes every
class slot would otherwise sell at list. The operative bar for a room with empty hours is lens
(a) **plus** "the room earns at least its pack rate on every hour it gives up". Lens (c) marks
the point at which a busy calendar should push the course to list price.

### 4.2 Candidates — individual

| Price | /class-h | /total-h | Net after fee | Instructor share | Cash margin, owner | Cash margin, hired | Room yield / class-h, hired | Room yield / total-h, hired | vs por separado |
|---|---|---|---|---|---|---|---|---|---|
| $229.990 | $25.554 | $15.333 | $221.259 | 58.7% | $221.259 | $86.259 (37.5%) | $9.584 | $5.751 — below net pack | −26.5% |
| **$249.990** | $27.777 | $16.666 | $240.500 | 54.0% | $240.500 | $105.500 (42.2%) | $11.722 | $7.033 — above net pack | **−20.1%** |
| $269.990 | $29.999 | $17.999 | $259.741 | 50.0% | $259.741 | $124.741 (46.2%) | $13.860 | $8.316 ≈ net valle | −13.7% |
| $289.990 | $32.221 | $19.333 | $278.982 | 46.6% | $278.982 | $143.982 (49.7%) | $15.998 | $9.599 | −7.3% |

Benchmarks for the room-yield columns: net pack $6.722/h · net valle $8.395/h · net punta semana
$12.597/h. Owner-teaches room yield is simply net after fee ÷ 9 = $24.584 / $26.722 / $28.860 /
$30.998 per class-hour, of which $15.000 is the owner-as-instructor share.

**À la carte ("por separado")** at the new structure — same method as the August audit, valle
list, volume discount on room only. Derive it from `lib/pricing.ts` constants; never hard-code it.

| Item | Qty | Unit | Amount |
|---|---|---|---|
| Sala valle, 6 × 1.5h (no volume discount under 2h) | 9h | $9.990 | $89.910 |
| 1:1 guiado (`GUIDED_RATE`, not discountable) | 9h | $14.990 | $134.910 |
| Práctica libre valle as one 6h block at −20% | 6h | $7.992 | $47.952 |
| Grabación audio + video (add-on) | 1 | $39.990 | $39.990 |
| **Por separado** | | | **$312.762** |

### 4.3 Candidates — dúo (per person; cabin = 2 seats)

| Per person | Cabin | Cabin net after fee | Cash margin, hired (cabin) | Cabin yield / class-h, hired | vs individual @ $249.990 ($11.722) |
|---|---|---|---|---|---|
| $139.990 | $279.980 | $269.352 | $134.352 | $14.928 | +27% |
| **$149.990** | $299.980 | $288.592 | $153.592 | $17.066 | **+46%** |
| $159.990 | $319.980 | $307.833 | $172.833 | $19.204 | +64% |

The owner's principle (dúo out-yields individual per cabin-hour) holds for every pair except
($289.990, $139.990). Per total hour it holds at ($249.990, $149.990) in the worst case ($7.314
vs $7.033) and comfortably ($11.522/h) when the pair practices together. Hence: **dúo practice
is booked as a pair by default**, solo on request.

### 4.4 Recommendation

| Item | Launch — "precio de lanzamiento · primeros 10 alumnos" | List (after) | Why |
|---|---|---|---|
| Curso individual | **$249.990** | **$269.990** | 9h clase 1:1 + 6h práctica + set final A+V. Ex-recording it is $23.333/class-h: parity with Estudio -1 ($23.750), below The Loft ($25.000) at 42% of its ticket, and +11–32% over "freelancer + rented valle room" ($189.000–225.000) while bundling practice, recording and one accountable provider. $229.990 would put a Viña 1:1 product below a Santiago school and drop hired-DJ room yield below net valle — ~$20.000 left on the table per student. $269.990 is where the valle lens breaks even with a hired DJ; print it from day one so moving there is not a price increase. |
| Curso dúo, por persona | **$149.990** | **$159.990** | −40% vs individual per person; +46% cabin yield. An acquisition channel ("ven con un amigo"), not cannibalisation — the dúo buyer is a pair. |
| Sesión de prueba, 1h | **$19.990** | — | Credited 100% if the student enrols and pays within 7 days (individual pays $230.000; dúo $130.000 per person who took a trial). One per person, non-transferable, not combinable with points. Trial slots valle / punta semana only. Keep $19.990: at $24.990 it equals a guided hour and stops being a product; for a converter it costs nothing. Hired-DJ trials cost $15.000 against $19.990 revenue → prefer the owner teaching trials. |
| Pack Egresado | $39.990 · 5h valle · 90 days | — | unchanged |
| Sala por hora | desde $9.990 | — | unchanged |

Price ladder for the landing: **Sesión de prueba $19.990 → Curso dúo $149.990 p/p → Curso
individual $249.990 → Pack Egresado 5h $39.990 → Sala por hora desde $9.990.**

Copy anchor: "Por separado: $312.762 · Curso individual: $249.990 (−20%)". For the dúo the
stronger line is "−40% por persona".

If the owner later prefers to hold $249.990 with a hired DJ rather than move to list, pay
$12.000/h ($108.000 per course) → 53% cash margin. Decide before the first hire.

### 4.5 Sensitivity

Structure (same per-class-hour economics): 5 × 2h → $279.990 / $169.990 · 6 × 2h → $329.990 /
$199.990. Keeping $249.990 at 6 × 2h with a hired DJ gives a 72% instructor share and
$5.042/class-h room yield — not viable. 1.5h is also the local 1:1 norm.

Break-even against rent, cash lens, launch prices, the whole rent charged to the course (room
rentals also carry it, so this is conservative):

| Enrollments to cover $190.000 | Individual, owner ($240.500) | Individual, hired ($105.500) | Dúo cabin, owner ($288.592) | Dúo cabin, hired ($153.592) |
|---|---|---|---|---|
| | **1** (0.8) | **2** (1.8) | **1** (0.7) | **2** (1.2) |

| Month | Owner teaches | Hired DJ at $15.000/h |
|---|---|---|
| 2 individual | $481.000 − 190.000 = **$291.000** | $211.000 − 190.000 = **$21.000** |
| 3 individual | $721.500 − 190.000 = **$531.500** | $316.500 − 190.000 = **$126.500** |
| 4 individual + 1 dúo | $1.250.592 − 190.000 = **$1.060.592** | $575.592 − 190.000 = **$385.592** |
| 6 individual + 2 dúo (≈ 17 teaching-h/week at steady state) | $2.020.184 − 190.000 = **$1.830.184** | $940.184 − 190.000 = **$750.184** |

While the owner teaches, one enrollment a month pays the rent. With hired DJs the course needs
≈ 2 a month to carry the rent on its own; each further one adds ≈ $105k (individual) or ≈ $154k
(dúo cabin) — which is why the list price ($269.990 → $124.741 net) matters once instructors are
paid. Capacity: 12 hired-DJ enrollments a month ≈ 18 concurrent students ≈ 48% of open hours,
the regime where list price should apply.

## 5. Offer & payment terms

**Includes (both plans):** 9 horas de clase 1:1 (6 sesiones de 1,5h) · 6 horas de práctica
libre en la sala · set final grabado en audio y video en la sesión 6 · Pack Egresado available
after. Dúo: 2 personas · 1 instructor · 1 cabina; practice together by default.

**Payment.**

- **100% anticipado.** Transferencia as the default (fee $0). Mercado Pago link as the card
  alternative, with release set to **"en 10 días"** (3.44%): funds land after the 7-day refund
  window and it saves ≈ $900 per enrollment. Confirm in the panel whether MP returns the fee on
  a full refund; if not, budget ≈ $8.600 per refunded card sale.
- **No "cuotas sin interés" at launch**: the surcharge is unverified for Chile and each point
  costs ≈ $2.975 per enrollment (at 5% ≈ $14.900, more than the whole base fee). FAQ line:
  "puedes pagar en cuotas con tu tarjeta; el interés lo fija tu banco" — MP allows up to 12
  cuotas at no seller cost when "sin interés" is off. Revisit only after reading the surcharge
  in the account panel, never on the launch price.
- **2 pagos** (50% at enrollment, 50% before session 3) on request via WhatsApp, not on the
  landing. FOTF is never exposed: 2/6 delivered against 50% collected.
- **No standing transfer discount**: 5% = $12.500, more than the $9.490 fee it saves. If a lever
  is needed, a fixed "−$9.990 pagando por transferencia" (≈ the fee, reads as "una hora de
  sala"); cap any % at 3%.

## 6. Policies (→ `/terminos`)

- **Refund:** ≥ 7 days before session 1 → 100%. < 7 days → reschedule the sessions or name a
  replacement student (no "siguiente generación" anymore). After session 1 → no refund;
  remaining sessions are rescheduled within the course window.
- **Trial credit:** $19.990, 100% against the course if enrolled and paid within 7 calendar days
  of the trial; one per person; non-transferable; cannot combine with points.
- **Course window:** the 6 sessions happen within **10 weeks** of session 1. **Practice hours
  expire 90 days after session 6** (same window as the Pack Egresado).
- **Student cancellation / no-show:** ≥ 24h → rescheduled, no loss. < 24h or no-show → one
  "gracia" per course (rescheduled), then the session counts as delivered.
- **Instructor cancellation:** rescheduled, no charge to the student.
- **Dúo:** both seats on one order; practice hours booked as a pair by default; a replacement
  student may take over a seat before session 1.
- Points: the course neither earns nor accepts them (unchanged); Pack Egresado and room hours do.

## 7. Instructors: contract, payroll, no-shows

- Contract line: **"$15.000 bruto por hora de clase, retención según tasa vigente"** — never
  hard-code 15.25%. Per 1.5h session: $22.500 bruto → $3.431 retained → $19.069 líquido. Per
  9h course: $135.000 bruto → $20.588 retained → $114.413 líquido. (If the owner meant $15.000
  líquido, bruto is $17.699/h and the course costs $159.292 — every table above shifts by
  ≈ $24.000 per enrollment.)
- FOTF withholds and declares the retention monthly on the F29 as agente retenedor. If the DJ
  cannot issue boletas, FOTF issues a boleta de prestación de servicios de terceros with the
  same retention. Keep it a civil "contrato de prestación de servicios a honorarios": the
  instructor sets availability, FOTF matches students, pay only for sessions taught, no
  exclusivity, no fixed roster.
- **Payroll record = the per-session log** the admin already needs for scheduling and
  practice tracking: date · start · duration · student or pair · program code · session n ·
  **instructor** · status (dictada / no-show alumno / cancelada alumno < 24h / cancelada
  alumno ≥ 24h / cancelada instructor / cancelada FOTF) · recording delivered (session 6) ·
  student acknowledgement (a WhatsApp message is enough) · pay due. Month-end: sum → one boleta
  for the bruto → pay líquido.

| Event | Student | Instructor pay |
|---|---|---|
| Student cancels ≥ 24h | rescheduled | $0 |
| Student cancels < 24h / no-show, first time | one gracia, rescheduled | $11.250 (50%) |
| Student cancels < 24h / no-show, subsequent | session consumed | $22.500 (100%) |
| Instructor cancels | rescheduled | $0 — two < 24h cancellations → contract review |
| FOTF cancels (room, equipment) | rescheduled | $11.250 |

## 8. Curriculum — Curso de Iniciación DJ

Curso 1:1 (o dúo) de 6 sesiones de 90 minutos más 6 horas de práctica libre, en sala aislada
acústicamente con 2× Pioneer XDJ-1000MK2, Pioneer DJM-450 y 2× Pioneer DJ VM-50. Tú traes
audífonos y un pendrive; la sala no tiene laptop. Se aprende a mezclar en cabina de club con tu
propia música. Queda fuera: scratch, vinilo y producción.

### 8.1 Resultado del curso

Al terminar, puedes:

1. Armar la cabina solo en menos de 5 minutos: encender en orden, conectar tu USB a ambos decks
   vía Pro DJ Link, ajustar TRIM para que cada canal marque 0 dB en los picos sin tocar rojo, y
   configurar audífonos (CUE, MIX, LEVEL) en la DJM-450.
2. Cuadrar dos tracks a oído, sin SYNC y con el BPM tapado, en menos de 32 compases, usando
   fader de tempo y jog.
3. Entrar en frase: arrancar el track entrante en el 1 de una frase y hacer el cambio de graves
   en un 1, con transiciones de 4, 8, 16 o 32 compases según el género.
4. Preparar un USB en Rekordbox con grid corregido, hot cues A–D con criterio fijo, un loop
   guardado por track y playlists ordenadas, que carga en cualquier XDJ o CDJ Pioneer.
5. Navegar los XDJ-1000MK2 sin ayuda: búsqueda, hot cues, memory cues, beat loops, beat jump y
   quantize.
6. Hacer una transición con cambio de tempo usando ECHO de la DJM-450 (echo out) y un blend
   largo con FILTER, sin que se note el corte.
7. Armar y tocar un set de 25–30 minutos con curva de energía y tonalidades compatibles
   (Camelot), grabado en audio y video, sin trenes ni rojo en el master.
8. Decir cuándo usar SYNC y cuándo no, y recuperar una mezcla que se desalinea sin parar el track.

### 8.2 Mapa de las 6 sesiones

| # | Sesión | Al salir sabes… |
|---|---|---|
| 01 | Sonido y primera transición | Encender y nivelar la cabina, monitorear en audífonos y mezclar dos tracks del mismo BPM con fader y cambio de graves. |
| 02 | Beatmatching manual | Cuadrar tempo y fase a oído con fader de tempo y jog, sin SYNC. |
| 03 | Frases y mezcla larga | Entrar y salir en frase con el BPM tapado, y encadenar 4 tracks sin parar. |
| 04 | Rekordbox y USB | Preparar y exportar una biblioteca con grid, cues, loops y playlists, y navegarla completa en los XDJ. Traes tu laptop. |
| 05 | Set, filtro y FX | Ordenar un set de 25–30 min por energía y tonalidad, usar FILTER y ECHO en transiciones, y usar SYNC solo cuando corresponde. |
| 06 | Set final grabado | Hacer soundcheck, tomar la cabina de otro DJ y tocar un set grabado que te llevas con feedback escrito. |

### 8.3 Sesión 1 — Sonido y primera transición

**Objetivo:** salir habiendo mezclado dos tracks del mismo BPM con niveles correctos y cambio de
graves, y sabiendo encender, usar y dejar la sala solo.

- **0–10 · Cadena de señal.** Encendido en orden: XDJ → DJM-450 → VM-50 (apagado al revés).
  Cable LINK entre los dos XDJ-1000MK2. USB en el deck 1. Selector de entrada de cada canal en
  LINE. Desde el minuto 2 lo haces tú.
- **10–25 · Cargar y controlar.** Pantalla táctil: playlist → LOAD. PLAY/PAUSE, CUE (fija el cue
  en pausa; CUE vuelve al punto), TRACK SEARCH, SEARCH, needle search sobre la onda. JOG MODE en
  CDJ (en VINYL, tocar la parte de arriba detiene el track). Leer la onda: barras altas y
  regulares = bombo.
- **25–45 · Ganancia y monitoreo.** TRIM hasta que el canal marque 0 dB en los picos, nunca rojo.
  EQ a las 12. MASTER LEVEL lo fija el instructor y no se toca más; BOOTH para los VM-50.
  Audífonos: botón CUE del canal, MIX (CUE ↔ MASTER), LEVEL. Ejercicio: nivelar 5 tracks de
  distinta sonoridad por medidor y confirmar a oído. Headroom: dos tracks sonando a la vez suman;
  si cada uno va al límite, la transición clipea.
- **45–75 · Primera transición.** Dos tracks del mismo BPM (el instructor los elige de tu USB o
  iguala el tempo por pantalla; SYNC apagado). Tú: cue en el primer bombo del entrante, cuenta
  1–8 sobre el que suena, PLAY en el 1, fader del entrante sube en 8 compases con LOW abajo,
  cambio de graves en un 1, fader del saliente baja en 4–8 compases. Crossfader al centro con
  curva suave: se mezcla con los faders de canal. A→B y B→A, mínimo 6 veces.
- **75–90 · Cierre.** Una transición completa sin ayuda. Protocolo de sala para tu hora libre:
  encendido, apagado, faders abajo, EQ a las 12, monitores apagados. Tarea por escrito.

**Conceptos clave:** cadena de señal · TRIM vs fader vs MASTER · medidores y headroom · mezcla
de cue en audífonos · CUE/PLAY · contar 1–8 y ubicar el 1 · el LOW es la banda que pelea.

**Errores típicos:** subir MASTER o BOOTH porque "suena bajo" (es TRIM) · TRIM en rojo · mezclar
sin audífonos o con MIX todo en CUE · arrancar fuera del 1 · bajar el saliente antes del cambio
de graves · entrar con LOW completo · monitores a volumen de club.

**Tarea de sala (1h):** 10 min: enciende, conecta y nivela 5 tracks. 40 min: 10 transiciones con
pares del mismo BPM (lista que te deja el instructor, o iguala el tempo por pantalla), cada una
con cambio de graves en un 1; anota cuántas arrancaron en el 1. 10 min: deja la sala como la
encontraste. **Meta:** 10 transiciones, al menos 6 arrancando en el 1.

**Dúo:** alternan cada 2 transiciones. El que no está en los decks cuenta en voz alta el 1–8 del
track que suena y vigila los medidores.

**Criterio de avance:** nivelas y monitoreas sin ayuda; arrancas en el 1 en 3 de 5 intentos; el
cambio de graves ocurre y se escucha.

### 8.4 Sesión 2 — Beatmatching manual

**Objetivo:** cuadrar tempo y fase de dos tracks a oído, con el fader de tempo y el jog, sin SYNC.

- **0–10 · Repaso.** Armas la cabina solo y haces una transición de la sesión 1. Revisión de tu
  hoja de tarea.
- **10–30 · Oído y controles.** El instructor pone el mismo track en los dos decks, desajusta uno
  y te hace escuchar: dos bombos casi juntos ("flam") = fase; se separan de a poco = tempo. TEMPO
  RANGE en ±10 (resolución fina, alcance suficiente). MASTER TEMPO encendido. Nudge: girar el
  borde del jog en modo CDJ adelanta o atrasa mientras giras; el fader cambia la velocidad de
  forma permanente. Regla: primero fase con el jog, después juzga 8 compases; si se abre, corrige
  el fader; si no, listo. Audífonos con MIX hacia CUE y algo de MASTER, o técnica de una oreja.
- **30–55 · Mismo track en ambos decks.** El instructor desajusta el deck 2 entre ±1% y ±4% sin
  que veas. Tú: cue en el primer bombo, PLAY en el 1, escucha, di en voz alta "más rápido / más
  lento", nudge, fader, vuelve a caer en el 1 con CUE + PLAY. 8 intentos cronometrados en compases.
- **55–75 · Dos tracks distintos**, misma familia de BPM (≤ 3 BPM de diferencia). Misma rutina.
  Cuando cuadre, transición completa de la sesión 1 manteniendo la fase con toques de jog durante
  el blend. 4 transiciones.
- **75–90 · Cierre.** Un cuadre + transición sin ayuda. Tarea.

**Conceptos clave:** tempo vs fase · fader de tempo y rangos (±6/±10/±16/WIDE) · nudge con el
jog · MASTER TEMPO · "el entrante se ajusta al que suena" · sonido del error (flam vs deriva).
Nota de género: en house/techno el bombo va en los cuatro tiempos y el flam se escucha fácil; en
reggaetón el bombo no marca los cuatro tiempos, usa la caja del dembow como referencia de fase.

**Errores típicos:** tocar la parte de arriba del jog (por eso modo CDJ) · usar el fader como
nudge y pasarse · mirar ondas o BPM en vez de escuchar · corregir antes de 4 compases o esperar
32 · caer fuera del 1 · audífonos muy fuertes · MIX solo en CUE (no escuchas el master) · mover
el deck equivocado.

**Tarea de sala (1h):** 15 min: mismo track en ambos decks, mueve el fader de tempo del deck 2
sin mirar, cuadra a oído; 10 repeticiones. 35 min: 10 cuadres con tracks distintos; anota el par
y los compases hasta cuadrar. 10 min: 3 transiciones completas. **Meta:** promedio bajo 64
compases y al menos 3 cuadres bajo 32.

**Dúo:** uno desajusta el deck del otro sin que vea y cuenta los compases; cambian en cada
intento. El observador solo dice "más rápido / más lento" después de que el que mezcla lo dijo.

**Criterio de avance:** cuadras a oído dos tracks de BPM similar bajo 64 compases en 3 de 5
intentos y mantienes la fase durante 16 compases de blend.

### 8.5 Sesión 3 — Frases y mezcla larga

**Objetivo:** mezclar en frase: entrar y salir donde la estructura lo pide, con el tempo cuadrado
a oído y el BPM tapado.

- **0–10 · Repaso.** El instructor desajusta, tú cuadras y mezclas. Revisión de la hoja (compases
  por cuadre).
- **10–30 · Estructura.** Con 4 tracks tuyos en pantalla: intro, entrada del bajo o drop,
  breakdown, drop, outro. Compás (4 tiempos), frase (8 compases), secciones de 16 y 32. Dónde
  entrar: en el 1 de una frase, intro del entrante sobre outro del saliente. Notas de género:
  house/techno: frases de 8/16/32, intros de 16–32 compases, blends de 16–32. Reggaetón/urbano:
  frases de 4–8, voz desde el inicio, intros cortas; blends de 4–8 compases sobre partes
  instrumentales, salida al final del coro, o corte en el 1. Open format: mezcla lo que se deja,
  corta lo que no.
- **30–55 · BPM tapado.** Cinta sobre el BPM de ambas pantallas. El instructor desajusta. Tú:
  cuadra a oído, espera el 1 de frase, entra con LOW abajo, blend de 16 compases (8 en urbano),
  cambio de graves en un 1, saliente fuera en su outro. Las dos primeras el instructor cuenta la
  frase en voz alta; después, en silencio. 6 transiciones.
- **55–75 · Mini set.** 4 tracks seguidos, 3 transiciones, sin parar. JOG MODE en VINYL si te
  acomoda: sostén el plato en el cue y suelta en el 1; si no, CUE + PLAY. EQ a las 12 al terminar
  cada track.
- **75–90 · Cierre.** Repite el mini set con otros 4 tracks. Tarea. Aviso: trae tu laptop a la
  sesión 4.

**Conceptos clave:** compás / frase / sección · intro y outro · entrar en frase · cambio de
graves en un 1 · largos de transición (4/8/16/32) · corrección de deriva durante el blend con el
jog, no con el fader · VINYL vs CDJ · el LOW de la DJM-450 al mínimo atenúa mucho pero no es un
kill total.

**Errores típicos:** entrar 1–2 compases tarde y "esperar la próxima" sin contar · mezclar sobre
la voz (urbano) o sobre un breakdown sin querer · dos bajos a la vez · tocar el deck saliente en
vez del entrante · corregir con el fader de tempo durante el blend · bajar el saliente de golpe ·
EQ que queda torcido para el próximo track.

**Tarea de sala (1h):** 10 min: 5 tracks, cuenta y anota el largo de la intro en compases.
40 min: 12 transiciones en frase con el BPM tapado (tápalo tú); anota compases hasta cuadrar y si
entraste en frase. 10 min: mini set de 4 tracks sin parar. **Meta:** 8 de 12 entradas en frase;
promedio de cuadre bajo 32 compases.

**Dúo:** mini set b2b, un track cada uno; el que no mezcla cuenta la frase en silencio y marca el
1 con la mano. Cambian en cada transición.

**Criterio de avance:** mini set de 4 tracks con tempo a oído y BPM tapado; al menos 2 de 3
entradas en frase con cambio de graves limpio.

### 8.6 Sesión 4 — Rekordbox y USB

**Objetivo:** salir con un USB que funciona en cualquier cabina Pioneer: grid corregido, cues con
criterio, loops, playlists, y navegación completa en los XDJ-1000MK2. Traes tu laptop.

- **0–10 · Repaso.** Una transición a oído con tu USB actual mientras arranca la laptop.
  Diagnóstico de la biblioteca: qué falta.
- **10–40 · En Rekordbox (modo Export, plan Free).** Preferencias → Analizador: modo Normal,
  análisis de tonalidad activado, formato alfanumérico (1A–12B, equivalente Camelot). Grid:
  reproduce desde el 1 y corrige con el editor de grid (desplazar / ajustar BPM); tracks de tempo
  variable (grabados en vivo, cumbia, reggaetón antiguo) se marcan y no llevan loops ni quantize.
  Hot cues con criterio fijo: **A** = primer bombo (entrada), **B** = entra el bajo o drop,
  **C** = breakdown, **D** = inicio del outro (salida). Memory cues como marcas de "aquí mezclo".
  Un loop de 8 compases guardado en el outro para alargar. Color o My Tag de energía 1–5.
  Playlists: "Set final" ordenada + una por rango de tempo. Exportar: panel Dispositivos →
  arrastrar la playlist → esperar que termine → expulsar. Pendrive en FAT32.
- **40–70 · En los XDJ.** USB en el deck 1; en el deck 2, botón LINK para navegar ese mismo USB
  vía Pro DJ Link. Búsqueda por teclado en pantalla, ordenar por BPM o tonalidad, pestaña HOT CUE
  en la pantalla táctil, CUE/LOOP CALL ◄ ► para memory cues, QUANTIZE encendido (cues y loops
  caen al grid), LOOP IN / 4 BEAT, 1/2X y 2X, RELOOP/EXIT, BEAT JUMP de 8 o 16 compases para
  alinear frases. Demo de tonalidad: dos tracks compatibles (mismo número, ±1 con la misma letra,
  o A↔B con el mismo número) contra dos que chocan, en un blend largo. Ejercicio: 3 transiciones
  arrancando desde el hot cue A, tempo a oído.
- **70–85 · Práctica.** Mini set de 4 tracks elegidos por tonalidad compatible; loop de outro
  cuando el intro del entrante es corto; entrada desde hot cue.
- **85–90 · Cierre y tarea.**

**Conceptos clave:** grid (de él dependen quantize, loops, beat jump y SYNC) · hot cue vs memory
cue · quantize · loop y frase · Camelot básico · MASTER TEMPO y tonalidad (±6% de tempo ≈ 1
semitono) · FAT32 · una biblioteca, un USB, un respaldo.

**Errores típicos:** análisis en modo dinámico sin necesidad · confiar en el grid de tracks en
vivo · 8 hot cues por track que no significan nada · exportar los tracks pero no la playlist ·
sacar el USB mientras el LED parpadea · pendrive en NTFS o APFS · playlists de 300 tracks ·
nombres de archivo ilegibles.

**Tarea de sala (1h):** antes de venir, deja el USB con ≥ 30 tracks preparados (grid, A–D, loop
de outro, energía, 2–3 playlists). En sala: 10 transiciones desde hot cue con tempo a oído, al
menos 5 entre tonalidades compatibles (anótalas); prueba el flujo de un solo USB en ambos decks
vía LINK. **Meta:** todos los tracks de "Set final" con cues; 10 transiciones, 5 compatibles.

**Dúo:** cada uno trae laptop y prepara su propio USB. En los decks: uno navega y prepara el
próximo track (cue, loop) mientras el otro mezcla; después practican entrar con el segundo USB en
el otro deck, como en un cambio de DJ.

**Criterio de avance:** USB con ≥ 30 tracks con grid y cues y una playlist "Set final"; cargas
cualquier track por búsqueda, saltas a un cue, armas un loop y mezclas a oído desde un hot cue.

### 8.7 Sesión 5 — Set, filtro y FX

**Objetivo:** construir un set de 25–30 minutos con curva de energía, usar FILTER y Beat FX de la
DJM-450 solo donde aportan, y decidir cuándo usar SYNC.

- **0–10 · Repaso.** Transición a oído desde hot cue con loop de outro.
- **10–30 · Curva y selección.** Con tu playlist: 8–12 tracks (house/techno) o 12–16 (urbano) en
  orden: abrir bajo, subir, peak cerca de los dos tercios, cerrar. Filtros de selección: energía
  1–5, tonalidad compatible en blends largos, saltos de tempo ≤ 3 BPM entre tracks a oído; saltos
  mayores necesitan un recurso (echo out, corte, breakdown). "Leer la pista" traducido a la sala:
  cambia la energía cada 2–3 tracks, no en cada uno; piensa 2 tracks adelante. Escribes la lista:
  track, BPM, tonalidad, cue de entrada, tipo de transición.
- **30–55 · FX en la DJM-450.** SOUND COLOR FX → **FILTER** como herramienta principal:
  pasa-altos sobre el saliente para hacer espacio, pasa-bajos sobre el entrante; PARAMETER
  controla la resonancia. SWEEP, NOISE y DUB ECHO se prueban y se descartan si no aportan. BEAT
  FX: selector de canal (1 / 2 / MASTER), tipo, TIME por beats (◄ ►) o TAP, LEVEL/DEPTH, ON/OFF,
  X-PAD para variar el tiempo en vivo. Los que usamos: **ECHO** (echo out: 1/2 o 3/4 de beat,
  LEVEL/DEPTH 50–60%, ON y fader abajo; la cola sigue y cambias de tempo), **DELAY** en una voz,
  **REVERB** en un breakdown, **FLANGER** en una subida. Los demás quedan fuera. Reglas: un efecto
  por transición; LEVEL/DEPTH bajo 60%; OFF apenas termine. Ejercicios: (1) echo out con salto de
  tempo, por ejemplo 124 → 95 BPM, house → reggaetón; (2) blend de 16 compases con FILTER;
  (3) corte en el 1 con el crossfader en curva dura (urbano).
- **55–75 · SYNC como herramienta.** Cómo funciona en el XDJ-1000MK2 (MASTER + SYNC vía LINK;
  depende del grid). Cuándo sirve: saltos de tempo en open format, blend largo con voz mientras
  operas FX, emergencia. Cuándo no: grid dudoso, o cuando reemplaza escuchar. Ejercicio: 2
  transiciones con SYNC verificando a oído y corrigiendo con el jog si el grid miente; después
  SYNC OFF para el resto.
- **75–90 · Ensayo.** Primeros 10 minutos del set, sin parar. Notas del instructor. Tarea.

**Conceptos clave:** curva de energía · selección por energía, tonalidad y BPM · FILTER como
transición por defecto · Beat FX: canal, TIME, LEVEL/DEPTH · echo out · curvas de crossfader ·
SYNC/MASTER y su dependencia del grid. Género: house/techno = blends largos con filtro; urbano =
cortes, echo outs y blends cortos sobre instrumental; open format = echo out con cambio de tempo,
o entrada sobre a cappella.

**Errores típicos:** FX en todo · reverb que no termina · FX encendido después de la transición ·
LEVEL/DEPTH al máximo · echo out con TIME fuera de beat · saltos de tempo sin recurso · set que
hace peak en el track 3 · "puros hits" · ignorar tonalidad en blends largos · apretar SYNC y
dejar de escuchar.

**Tarea de sala (1h):** corre el set completo dos veces desde la playlist, grabando con el
teléfono (nota de voz sobre la mesa basta). Entre corridas, arregla las dos transiciones que
fallaron. Anota minuto, track y tipo de transición. **Meta:** segunda corrida sin parar y cada
transición con tipo decidido.

**Dúo:** cada uno arma su mitad de 12–15 min; acuerdan el punto de traspaso (qué track, quién lo
carga) y lo ensayan dos veces.

**Criterio de avance:** lista escrita de 25–30 min con BPM, tonalidad, cue y transición por
track; echo out y blend con filtro limpios; explicas cuándo usar SYNC y no lo usas por defecto.

### 8.8 Sesión 6 — Set final grabado

**Objetivo:** tocar un set de 25–30 minutos grabado en audio y video, con soundcheck, traspaso de
cabina y debrief.

- **0–15 · Soundcheck.** Armas la cabina solo: encendido, USB, LINK, TRIM de los dos primeros
  tracks a 0 dB, MASTER fijado, audífonos. El instructor arma la grabación: REC OUT (RCA) de la
  DJM-450 al grabador, o salida USB de la DJM-450 a su laptop; se calibra con el track más fuerte
  del set para que los picos queden en −6 dBFS; formato WAV. Video: teléfono en trípode, plano
  fijo que muestre manos y mixer; una palmada al inicio para sincronizar audio y video.
- **15–20 · Traspaso.** El instructor toca un track en el deck 1; tú entras en el deck 2 con tu
  USB y mezclas sin tocar MASTER ni BOOTH. Así empieza tu set y así pasa en un club.
- **20–50 · Grabación.** 25–30 min sin interrupciones. El instructor no interviene salvo falla
  técnica. Cierre limpio: el último track termina o sale con FILTER.
- **50–80 · Debrief.** Escuchan 3–4 momentos: apertura, mejor transición, una fallada, cierre.
  Primero te evalúas tú con la rúbrica; después el instructor, criterio por criterio. Copia del
  audio y del video a tu USB o teléfono.
- **80–90 · Cierre.** Qué practicar ahora, Pack Egresado, feedback escrito en 24h.

**Conceptos clave:** rutina de soundcheck · nivel de grabación y headroom · etiqueta de cabina
(no tocar MASTER, no sacar el USB del otro DJ hasta que termine su track, pedir el deck libre) ·
nervios: el plan está en la playlist y en los cues · recuperar un tren: fader abajo, CUE,
reentrar en la próxima frase · reset de EQ entre tracks.

**Errores típicos:** subir MASTER porque "se siente bajo" con la grabación andando · cambiar el
plan por nervios · saltarse el soundcheck · tocar monitores a mitad del set · sobrecorregir
después de un error · terminar sin cierre.

**Tarea de sala (última hora libre):** escucha la grabación con el feedback escrito; repite 5
veces las dos transiciones más débiles; graba un set nuevo de 15 min con el teléfono. **Meta:**
las dos transiciones corregidas en la nueva grabación.

**Dúo:** set b2b de 25–30 min, 12–15 min cada uno, con un traspaso grabado. Rúbrica individual.
El que no toca no ayuda.

**Criterio de egreso:** grabación entregada y rúbrica escrita dentro de 24h.

### 8.9 Rúbrica del set final

| Criterio | Base | Sólido | Destacado |
|---|---|---|---|
| **Tempo y fase (a oído)** | Cuadra con ayuda o con SYNC, o tarda más de 32 compases; flams audibles en 2 o más transiciones. | Todas las transiciones cuadradas a oído; máximo 1 flam audible, corregido en 2 compases. | Cuadra en menos de 16 compases, sin flams; los cambios de tempo del set se resuelven sin SYNC o con un recurso planificado. |
| **Frase y estructura** | Más de la mitad de las entradas fuera de frase; voces o bajos encimados. | La mayoría de las entradas en frase; cambio de graves en un 1; sin voces encimadas. | Todas las entradas en frase, con largos variados (4/8/16/32) y loops para alargar cuando hace falta. |
| **Niveles y EQ** | Rojo en canal o master; saltos de volumen entre tracks; dos bajos sonando a la vez. | Nivel parejo (≤ 3 dB entre tracks), sin rojo, cambio de graves limpio. | Las transiciones suenan como un solo track; EQ usado también en MID y HI; grabación con picos en −6 dBFS y sin clipeo. |
| **Selección y curva** | Los tracks no se conectan; energía al azar; choques de tonalidad en blends largos. | Curva coherente con un peak; tonalidad compatible en los blends largos. | Curva con intención (abrir, subir, peak, cerrar); cambios de tempo ubicados a propósito; cambios de tonalidad usados para subir. |
| **Preparación y cabina** | Busca tracks a mitad del set; faltan cues; FX quedan encendidos; EQ sin resetear; sin soundcheck. | Playlist lista, cues usados, FX solo en transiciones, soundcheck hecho, traspaso limpio. | Recupera un problema sin que se note; cada FX aporta algo concreto; deja la cabina como la encontró. |

### 8.10 Después del curso

- **Rutina de práctica:** 2 horas a la semana durante 3 meses: 15 min de mismo track en ambos
  decks con el tempo desajustado sin mirar, 30 min de transiciones en frase con el BPM tapado, el
  resto armando y corriendo un set. Graba todo con el teléfono y escúchalo al día siguiente.
- **Pack Egresado:** 5 horas de sala con los mismos XDJ-1000MK2 y DJM-450, acceso autogestionado,
  sin instructor, para usar dentro de los 3 meses siguientes. Trae tu USB y sigue la rutina de la
  sesión 5.
- **Lo que este curso es y no es:** 9 horas con instructor te dejan mezclando un set coherente de
  30 minutos a oído en una cabina Pioneer. No te dejan listo para una residencia; eso toma entre
  50 y 100 horas más de práctica y tocar frente a gente.
- **Primeros sets afuera:** fiestas de amigos, apertura (warm-up) en bares o eventos chicos, b2b
  con alguien con más horas. Manda tu grabación con la lista de tracks; el warm-up es la mejor
  escuela porque obliga a leer la pista.
- **Biblioteca:** 5 tracks nuevos por semana, todos con grid revisado, A–D y loop de outro antes
  de entrar a una playlist. Respaldo del USB una vez al mes.
- **Si quieres seguir con instructor:** sesiones sueltas de 90 min con un foco único (mezcla
  armónica, FX, preparar un set para una fecha concreta, o feedback sobre una grabación tuya).

### 8.11 Antes de partir

1. **Rekordbox** instalado en tu laptop (plan Free, modo Export) con cuenta creada. No necesitas
   plan pagado.
2. **20–30 tracks** que te gusten de verdad, en archivo: MP3 320 kbps, AAC, WAV o AIFF. Spotify
   o YouTube no sirven: los XDJ leen solo archivos en tu USB. Al menos 10 en el mismo rango de
   tempo.
3. **Importa y analiza** todos en Rekordbox (grid y tonalidad). Confirma que cada track muestre
   BPM y tonalidad. No corrijas grids todavía; eso se hace en la sesión 4.
4. **Una playlist** llamada "FOTF – Curso" con esos tracks.
5. **Pendrive** de 16 a 64 GB formateado en **FAT32** (funciona en cualquier cabina Pioneer,
   incluidos los XDJ-1000MK2 de la sala; exFAT sirve en equipos más nuevos pero no en todos; NTFS
   y APFS no sirven). Exporta la playlist desde el panel Dispositivos y expulsa bien.
6. **Qué traer:** el USB, audífonos y, solo a la sesión 4, la laptop con cargador. Audífonos:
   cerrados, con cable, plug de 6,3 mm o adaptador de 3,5 a 6,3 mm. Sin Bluetooth. No hacen
   falta modelos caros; sí que aíslen y aguanten volumen sin distorsionar.
7. **Escucha tus tracks contando 1–8** en voz baja antes de la sesión 1. Es el único ejercicio
   previo, y te ahorra media sesión.

### 8.12 Notas para el instructor

1. **SYNC apagado hasta la sesión 5.** Se enseña como herramienta con sus condiciones (grid
   correcto, verificar a oído), no como muleta. Beat FX no antes de la sesión 5; FILTER puede
   aparecer en la 3 si sale natural.
2. **El alumno está en los decks al menos 60 de los 90 minutos.** Cada demostración dura 2
   minutos como máximo y devuelve los controles.
3. **Cada sesión termina con una mezcla completa hecha por el alumno sin ayuda.** Desde la sesión
   3, un mini set de 4 tracks.
4. **A oído, con evidencia.** Desde la sesión 3 el BPM va tapado durante el entrenamiento. La
   onda no está prohibida, pero el alumno dice "más rápido / más lento" en voz alta antes de
   tocar nada.
5. **No se enseña scratch, vinilo ni producción.** Si el alumno pregunta, respuesta de una línea
   y referencia externa; no se usan minutos de sesión.
6. **La música es del alumno desde la sesión 1.** El instructor trae un kit de respaldo: 3 pares
   por género (house/techno, reggaetón/urbano, open format) con intros largas y grid estable,
   para las sesiones 1 y 2.
7. **Ganancia:** canales con picos en 0 dB, nunca rojo. MASTER lo fija el instructor en el
   soundcheck y el alumno no lo toca. Monitores VM-50 a un nivel de referencia fijo; la sala está
   aislada, nadie va a avisar si está demasiado fuerte.
8. **Grabación de la sesión 6:** desde REC OUT o USB de la DJM-450, picos en −6 dBFS, WAV. Video
   en plano fijo con palmada de sincronía. Archivos entregados el mismo día. **Feedback escrito
   con la rúbrica en 24h.**
9. **Tarea de sala por escrito** al final de cada sesión, con la meta medible. Los primeros 5
   minutos de la sesión siguiente se revisan las anotaciones (compases, transiciones). Si no usó
   la hora, se adapta el primer bloque; no se salta el criterio de avance.
10. **El criterio de avance es una puerta.** Si no se cumple, los primeros 20 minutos de la
    sesión siguiente se repite. No se pasa a FX con un alumno que no sostiene la fase 16 compases.
11. **Vocabulario común:** contar en voz alta "1-2-3-4-5-6-7-8"; usar "compás", "frase", "cue",
    "nudge", "cambio de graves"; los controles se nombran como en el panel (TRIM, MASTER TEMPO,
    QUANTIZE, LEVEL/DEPTH).
12. **Dúo:** alternancia estricta y el observador siempre con una tarea (contar, medidores,
    cronometrar compases). Rúbrica individual para cada uno. **Protocolo de sala:** orden de
    encendido, cable LINK conectado, crossfader al centro con curva suave hasta la sesión 4, y al
    cerrar: faders abajo, EQ a las 12, monitores apagados. Se enseña en la sesión 1 porque el
    alumno va a practicar solo.

## 9. Copy seeds for the landing (`lib/curso-content.ts`)

- `PRECIOS = { duo: 149990, individual: 249990, prueba: 19990 }`; `PRECIOS_LISTA = { duo: 159990,
  individual: 269990 }` for the "después" line.
- Scarcity line (replaces "Precios de primera generación · 6 cupos · hasta el 30 de
  septiembre"): **"Precio de lanzamiento · primeros 10 alumnos · después $269.990 / $159.990."**
  Count-based, so nothing expires at build time. Gold, not Sirena.
- Modalidad: **"Clases 1:1 · parte cuando quieras · cualquier día y horario."**
- Hero facts strip: **Sesiones 6 · Horas de clase 9 · Práctica libre 6h · Set final Grabado.**
- Hero editorial line (Fraunces italic): "Nueve horas con un DJ al lado, seis solo con la cabina."
- `INCLUYE`: "9 horas de clase 1:1 (6 sesiones de 1,5 h)" · "6 horas de práctica libre en la
  sala" · "Set final grabado en audio y video en la sesión 6".
- `SESIONES` (×6): the map in §8.2 — title + "al salir sabes" one-liner.
- Value anchor under the individual card: **"Por separado: $312.762 → −20%."** Under the dúo
  card: **"2 personas · 1 instructor · 1 cabina · −40% por persona."**
- FAQ additions: **¿Cuándo parte?** "Cuando tú quieras: fijamos las seis fechas contigo, una por
  semana por defecto, cualquier día de la semana." · **¿Puedo ir con un amigo?** "Sí, en dúo:
  comparten instructor y cabina, cada uno paga su precio y practican juntos." · **¿Cuánto
  dura?** "Seis semanas por defecto; las seis sesiones se dictan dentro de diez semanas." ·
  **¿Puedo pagar en cuotas?** "El curso se paga 100% anticipado, por transferencia o con
  tarjeta vía Mercado Pago; con tarjeta puedes usar las cuotas de tu banco (el interés lo fija
  tu banco)." · **¿Y si me enfermo?** "Avisando con 24 horas se reagenda sin costo."
- JSON-LD: `courseWorkload: "PT9H"`, `courseSchedule: { repeatCount: 6, repeatFrequency:
  "Weekly", duration: "PT1H30M" }`, offers from `PRECIOS`, `availability: InStock`.

## 10. Implementation sequence (code — separate approval)

Approach: **reinterpret each `course_generations` row as a per-enrollment *programa*** (1 row =
1 order; seats 1 for individual, 2 for dúo). A new `course_programs` table was rejected: same
behavior, far larger blast radius (`course_sessions.generation_id` and
`course_enrollments.generation_id` are NOT NULL and every course RPC joins through them).

Why it is safe: the seat-unique index and `course_enrollment_seat_bound` trigger stay exactly
right for 1–2 seats; `confirm_course_payment`, `cancel_course_order`,
`expire_abandoned_course_holds`, the practice RPCs and the tax-doc context keep working; prices
are already snapshotted per row. `schedule_course_generation` already accepts arbitrary
`starts_at/ends_at` per session (any day/hour), and `rangeFor` uses Luxon `plus({hours})` so
`durationHours: 1.5` works end-to-end — the only 1.5h blockers are app-level
(`Number.isInteger(durationHours)` in `app/admin/(panel)/curso/actions.ts`, whole-hour time
selects, `redeemPracticeAction` 1..4).

1. **PR 1 — `feat(curso): esquema del programa 1:1 (migración)`**, additive:
   `supabase/migrations/20260926120000_curso_programa.sql` — drop `course_generations_one_open`;
   `seats default 1`, `practice_hours_per_seat default 6`, `+instructor text ≤60` on
   generations and sessions, `practice_hours_total default 6`; sequence for codes `P0001…`;
   `create_course_program(...)` wrapper over the existing `create_course_enrollment` that also
   sets `practice_hours_total`; `release_course_program_sessions(gen)` called from
   `cancel_course_order` and the course branch of `mark_refunded` (no-op for room orders and for
   legacy cohorts with other live students); `schedule_course_generation` copies `instructor`.
   Prices stay in `lib/curso-content.ts`. Itests: invert "one open generation", 4h → 6h, program
   create/release, 6 × 90 grid. Read-only prod query on gen 01 before merging. **Wait for the
   prod migrate approval before PR 2.**
2. **PR 2 — `refactor(curso): dominio, puertos y repositorio del programa`**: `COURSE_PROGRAM =
   { sessions: 6, sessionMinutes: 90, classHours: 9, practiceHours: 6 }`; `NewProgram` +
   `createProgram()`, `listLiveEnrollments()`, instructor setters; emails drop "cupos" /
   "generación" and list 6 sessions; webhook and lead routes stop reading `currentGeneration()`.
3. **PR 3 — `feat(admin): curso 1:1 — programas, sesiones por alumno e instructor`**: `/admin/curso`
   around programs; delete `generaciones/`; `createProgramAction`, `scheduleProgramAction`
   (30-min step), `moveSessionAction`, instructor setters; ficha `Sesiones` card with
   mover/cancelar; `InscribirDialog` also from the bandeja; then delete legacy methods. Must pass
   `lib/admin-a11y-contract.test.ts`; visual check of a 90-min block on the agenda grid.
4. **PR 4a — `feat(curso): contenido y JSON-LD del programa 1:1`** (invisible while the flag is
   false): `lib/curso-content.ts`, landing components and JSON-LD, OG footer, home section,
   articles, cuenta, pago page — the full hardcoded-copy inventory is in the plan.
5. **PR 4b — `feat(curso): relanzar el Curso de DJ 1:1`**: terms (§6) + `TERMS_VERSION` bump,
   `cancellation-policy.ts` remedies (drop `transfer`), `aprender-dj.mdx` sentence,
   `CURSO_ABIERTO = true`, memory note.

Risks: the migration approval window (code that reads new columns must not deploy before the
prod migration is applied; staging must be `ACTIVE_HEALTHY`); gen 01 state in prod;
`currentGeneration()` returning an arbitrary open program between PR 1 and PR 3; the
`mark_refunded` edit (run `tax-reversal`, `webhook` and `course-billing` itests locally with
sandbox creds); `db:types` parity (`npm ci` first).

## 11. Open items for the owner

- Confirm the final prices ($249.990 / $149.990 / $19.990; list $269.990 / $159.990) and the
  "primeros 10 alumnos" cap.
- Confirm $15.000 is **bruto** (the tables assume it).
- Set the MP account to "dinero en 10 días" and read the actual fee and cuotas surcharge in
  "Comisiones y cuotas".
- Ask Technicals DJ Academy for its class price (only unpublished local comparable).
- Session one-liners and the hero editorial line (proposed in §8.2 / §9).
- Gen 01 in prod: does it exist, does it have live students, and do they get 6 practice hours.
- Instructor as free text on the program/session (proposed) vs a lookup table (deferred).
