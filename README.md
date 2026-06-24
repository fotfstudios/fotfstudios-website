# FOTF Studios — Sitio web

Sala de ensayo de DJ por hora en Viña del Mar. Sitio de una página construido con
Next.js 15 (App Router) y Tailwind CSS v4, fiel al **Manual de Marca v1.0**.

## Stack

- **Next.js 15** + React 19 (App Router, salida 100% estática)
- **Tailwind CSS v4** (config CSS-first en `app/globals.css`)
- Tipografías vía `next/font`: Big Shoulders (display), JetBrains Mono (funcional),
  Fraunces Italic (editorial)

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de producción
```

## Fidelidad de marca

- **Paleta** (`app/globals.css`): Ink `#0A0A0A` · Bone `#F5F2EC` · Gold `#E8C94A` ·
  Sirena `#FF4D1D`. Proporción 55/25/15/5. Sirena queda reservada solo para urgencia.
- **Logo** (`components/Logo.tsx`): cuatro barras con proporciones oficiales
  (100/50/75/71 %, gaps 0,18 X). Nunca se redibuja ni se deforma. Variantes:
  `lockup` · `mini` · `icon`.
- **Voz**: español de Chile, preciso y directo. Modelos exactos
  (2× Pioneer XDJ-1000MK2, DJM-450, monitores VM-70). «Aislada acústicamente»,
  nunca «insonorizada».
- **Fotografía**: clave baja, fondo negro, una sola fuente de luz, grano sutil.

## Fotografías

Las fotos viven en `public/photos` y se **descubren automáticamente** en el build
(`lib/photos.ts`), clasificadas por el prefijo del nombre. Copia tus archivos y
reconstruye — sin editar código. Ver `public/photos/README.md` para la convención.

Aparecen en: fondo del **Hero**, sección **La sala**, close-ups en **Equipo** y la
**Galería** (grid → lightbox con teclado, foco atrapado y bloqueo de scroll). Todas
pasan por `BrandImage` (grade sutil + scrim), respetando la dirección de arte del manual.

> Las imágenes `*.jpg` actuales son **placeholders**; reemplázalas por las reales.

## Movimiento e interacción

Toda la motion se inspira en el ritmo de la marca (four-on-the-floor, ecualizador,
«el pulso»). Es sobria, en transform/opacity, y respeta `prefers-reduced-motion`:

- **Revelado cinético** ([MaskText.tsx](components/MaskText.tsx)): los titulares suben
  línea por línea desde una máscara limpia.
- **Cursor de cabina** ([CustomCursor.tsx](components/CustomCursor.tsx)): punto + aro que
  crece sobre elementos interactivos. Solo en puntero fino (desktop).
- **Botones magnéticos** ([Magnetic.tsx](components/Magnetic.tsx)) en los CTA principales.
- **Cinta de transmisión** ([Ticker.tsx](components/Ticker.tsx)): marquee de datos en mono.
- **Parallax del Hero** ([ParallaxImage.tsx](components/ParallaxImage.tsx)): la foto deriva
  apenas con el cursor.
- **Medidor de scroll** (CSS scroll-driven, sin JS) y **grano analógico** animado.

En táctil o con «menos movimiento» activado, cursor/parallax/magnético se desactivan y
los textos aparecen sin animación.

## Pendiente antes de publicar

Editar `lib/site.ts`:

- `whatsapp`: reemplazar el número placeholder `56900000000` por el real
  (formato internacional, sin `+`).
- `PRICING.price`: confirmar el valor por hora (actualmente `$12.000`).
- Confirmar handle de Instagram (`fotfstudios`) y dirección exacta.

## Despliegue

Listo para Vercel: `vercel` o conectar el repo. Sin variables de entorno.
