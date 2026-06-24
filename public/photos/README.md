# public/photos — Fotografías de la sala

Las imágenes de esta carpeta se **descubren automáticamente** en el build
(`lib/photos.ts`) y se clasifican por el **prefijo** del nombre del archivo.
Copia tus fotos aquí y reconstruye (`npm run build`) — no hay que editar código.

> Las imágenes actuales (`*.jpg`) son **placeholders** generados para previsualizar
> el diseño. Reemplázalas por tus fotografías profesionales con los mismos prefijos.

## Convención de nombres

| Prefijo                         | Dónde aparece                          |
| ------------------------------- | -------------------------------------- |
| `hero-*`                        | Fondo del Hero (usa la primera)        |
| `cabina-*` / `sala-*`           | Sección «La sala» + galería            |
| `equipo-xdj-*`                  | Close-up Pioneer XDJ-1000MK2 + galería |
| `equipo-djm-*`                  | Close-up Pioneer DJM-450 + galería     |
| `equipo-vm70-*` / `equipo-monitor-*` | Close-up monitores VM-70 + galería |
| `equipo-*` / `gear-*`           | Close-up de equipo (genérico)          |
| cualquier otro nombre           | Solo galería                           |

Toda foto entra en la galería, **excepto** las `hero-*`.

## Recomendaciones (Manual de Marca · §12 Fotografía)

- Clave baja · negro real de fondo · una sola fuente de luz · el equipo es el héroe.
- Sin gente posando. Grano sutil permitido.
- Formatos: `.jpg`, `.png`, `.webp` o `.avif`. Cualquier proporción sirve
  (se recortan con `object-cover`; el lightbox muestra la foto completa).
- Para el hero conviene una foto **horizontal** (apaisada).

## Alt text

El alt se genera en español según la categoría. Para textos a medida, edita
`ALT_OVERRIDES` en `lib/photos.ts` con la clave = nombre exacto del archivo.
