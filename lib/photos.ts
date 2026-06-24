import fs from "node:fs";
import path from "node:path";

/**
 * Manifiesto de fotos — auto-descubrimiento.
 *
 * Lee public/photos en tiempo de build (Server Component / SSG) y clasifica
 * cada archivo por su PREFIJO de nombre. Así basta con copiar las fotos a
 * public/photos y reconstruir; no hay que editar este archivo.
 *
 * Convención de nombres (opcional pero recomendada):
 *   hero-*            → fondo del Hero
 *   cabina-* / sala-* → ambiente de la sala
 *   equipo-xdj-*      → close-up Pioneer XDJ-1000MK2
 *   equipo-djm-*      → close-up Pioneer DJM-450
 *   equipo-vm70-*     → close-up monitores Pioneer DJ VM-50
 *   equipo-* / gear-* → close-up de equipo (genérico)
 *   (cualquier otro)  → galería
 *
 * Toda foto entra además en la galería (salvo el hero).
 */

export type PhotoCategory = "hero" | "sala" | "gear";

export interface Photo {
  src: string;
  alt: string;
  category: PhotoCategory | "other";
  gearModel?: "XDJ-1000MK2" | "DJM-450" | "VM-50";
}

const PHOTO_DIR = path.join(process.cwd(), "public", "photos");
const EXT = /\.(jpe?g|png|webp|avif)$/i;

/** Alt en español, preciso. Sobrescribe por nombre exacto de archivo si quieres. */
const ALT_OVERRIDES: Record<string, string> = {};

function classify(file: string): Photo {
  const src = `/photos/${file}`;
  const name = file.toLowerCase();
  const override = ALT_OVERRIDES[file];

  if (name.startsWith("hero")) {
    return {
      src,
      category: "hero",
      alt: override ?? "Cabina de FOTF Studios a oscuras, con luz puntual sobre el equipo",
    };
  }

  if (name.startsWith("equipo") || name.startsWith("gear")) {
    let gearModel: Photo["gearModel"];
    let model = "el equipo Pioneer";
    if (name.includes("xdj")) {
      gearModel = "XDJ-1000MK2";
      model = "el reproductor Pioneer XDJ-1000MK2";
    } else if (name.includes("djm")) {
      gearModel = "DJM-450";
      model = "el mixer Pioneer DJM-450";
    } else if (name.includes("vm70") || name.includes("vm-50") || name.includes("monitor")) {
      gearModel = "VM-50";
      model = "los monitores Pioneer DJ VM-50";
    }
    return {
      src,
      category: "gear",
      gearModel,
      alt: override ?? `Close-up de ${model} en la cabina de FOTF Studios`,
    };
  }

  if (name.startsWith("cabina") || name.startsWith("sala")) {
    return {
      src,
      category: "sala",
      alt: override ?? "Sala de ensayo de DJ de FOTF Studios, aislada acústicamente",
    };
  }

  return {
    src,
    category: "other",
    alt: override ?? "FOTF Studios — sala de ensayo de DJ en Viña del Mar",
  };
}

/** Lee y clasifica todas las fotos. Tolerante a carpeta inexistente o vacía. */
export function getPhotos(): Photo[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(PHOTO_DIR).filter((f) => EXT.test(f) && !f.startsWith("."));
  } catch {
    return [];
  }
  files.sort((a, b) => a.localeCompare(b, "es"));
  return files.map(classify);
}

/**
 * Ubicaciones fijas: qué archivo va a cada sección. Fuente única para evitar
 * que una misma foto se repita entre Hero, Sala, Cierre, Equipo y Galería.
 */
export const PLACEMENT = {
  hero: "hero-booth.JPG",
  sala: ["cabina-4.JPG", "cabina-2.JPG"],
  cierre: "cabina-1.JPG",
  gear: {
    "XDJ-1000MK2": "equipo-xdj-jogwheel-1.JPG",
    "DJM-450": "equipo-djm-mixer.JPG",
    "VM-50": "equipo-vm70-cono-1.JPG",
  } as Record<NonNullable<Photo["gearModel"]>, string>,
  /** Destacadas de la galería (orden), "un poco de todo". */
  galleryFeatured: [
    "cabina-5.JPG",
    "cabina-6.JPG",
    "cabina-3.JPG",
    "equipo-xdj-touchscreen.JPG",
    "equipo-djm-1.JPG",
    "equipo-vm70-cono-2.JPG",
  ],
} as const;

/** Fotos visibles antes de "Ver más" en la galería. */
export const GALLERY_FEATURED_COUNT = PLACEMENT.galleryFeatured.length;

const bySrc = (photos: Photo[], file: string) =>
  photos.find((p) => p.src === `/photos/${file}`);

export function heroPhoto(photos: Photo[]): Photo | null {
  return (
    bySrc(photos, PLACEMENT.hero) ??
    photos.find((p) => p.category === "hero") ??
    photos.find((p) => p.category === "sala") ??
    null
  );
}

export function salaPhotos(photos: Photo[]): Photo[] {
  const picked = PLACEMENT.sala
    .map((f) => bySrc(photos, f))
    .filter((p): p is Photo => Boolean(p));
  return picked.length ? picked : photos.filter((p) => p.category === "sala").slice(0, 2);
}

export function gearPhotos(photos: Photo[]): Photo[] {
  return photos.filter((p) => p.category === "gear");
}

/**
 * Un close-up por modelo (XDJ → DJM → VM-50), con el archivo preferido de
 * PLACEMENT.gear; si falta, cae al primero del modelo.
 */
export function gearHighlights(photos: Photo[]): Photo[] {
  const gear = gearPhotos(photos);
  const order: NonNullable<Photo["gearModel"]>[] = ["XDJ-1000MK2", "DJM-450", "VM-50"];
  return order
    .map((model) => {
      const pref = PLACEMENT.gear[model];
      return (
        gear.find((p) => p.gearModel === model && p.src === `/photos/${pref}`) ??
        gear.find((p) => p.gearModel === model)
      );
    })
    .filter((p): p is Photo => Boolean(p));
}

/**
 * Galería: todas las fotos MENOS las reservadas en otras secciones (hero, sala,
 * cierre, destacados de equipo). Orden: destacadas primero, luego el resto.
 */
export function galleryPhotos(photos: Photo[]): Photo[] {
  const reserved = new Set<string>([
    `/photos/${PLACEMENT.hero}`,
    `/photos/${PLACEMENT.cierre}`,
    ...PLACEMENT.sala.map((f) => `/photos/${f}`),
    ...gearHighlights(photos).map((p) => p.src),
  ]);

  const pool = photos.filter((p) => p.category !== "hero" && !reserved.has(p.src));

  const featured = PLACEMENT.galleryFeatured
    .map((f) => pool.find((p) => p.src === `/photos/${f}`))
    .filter((p): p is Photo => Boolean(p));
  const featuredSrc = new Set(featured.map((p) => p.src));
  const rest = pool.filter((p) => !featuredSrc.has(p.src));

  return [...featured, ...rest];
}
