import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

/**
 * La tarjeta social de la marca, una sola vez.
 *
 * Las tres tarjetas del sitio (raíz, /curso-dj, /guia-dj) eran el mismo archivo de ~124
 * líneas copiado, y solo se diferenciaban en cinco cosas: el alt, la foto, el cuerpo del
 * titular, el pie izquierdo y un fontSize. Eso es lo que recibe ogImage().
 *
 * OJO con la foto: **satori NO aplica la rotación EXIF**. Una foto que el Finder muestra
 * derecha pero que trae orientación en EXIF sale de lado. Usar solo landscape nativas, o
 * recortes propios de public/og/.
 *
 * Las fuentes se leen relativas a process.cwd() desde app/_fonts/ — no mover ese
 * directorio (ver CLAUDE.md).
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const INK = "#0a0a0a";
const BONE = "#f5f2ec";
const BONE_DIM = "#b9b5ab";
const GOLD = "#e8c94a";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p));

/** Las barras de la marca, en la unidad que pida quien las use. */
function Bars({ unit }: { unit: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: unit * 0.18, width: unit * 4.6 }}>
      {[100, 50, 75, 37.5].map((w, i) => (
        <div key={i} style={{ height: unit, width: `${w}%`, backgroundColor: GOLD, borderRadius: 2 }} />
      ))}
    </div>
  );
}

export interface OgCardOptions {
  /** Ruta bajo public/, p. ej. "photos/cabina-10.JPG". Landscape nativa. */
  readonly photo: string;
  /** Las dos líneas del titular: la primera en bone, la segunda en gold. */
  readonly lines: readonly [string, string];
  /** Pie izquierdo, en mayúsculas: "PDF · 8 PÁGINAS · TE LLEGA AL CORREO". */
  readonly footLeft: string;
  /** 126 por defecto; la raíz usa 132 porque su titular es más corto. */
  readonly fontSize?: number;
  readonly footRight?: string;
}

export function ogImage(opts: OgCardOptions): ImageResponse {
  const photoSrc = `data:image/jpeg;base64,${read(`public/${opts.photo}`).toString("base64")}`;
  const display = read("app/_fonts/BigShoulders-900.ttf");
  const mono = read("app/_fonts/JetBrainsMono-500.ttf");

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", backgroundColor: INK }}>
        {/* Foto de cabina. satori NO es el DOM: rasteriza un subconjunto de HTML/CSS y no
            entiende next/image, así que <img> con data URI es la única forma. El lint exime
            a los archivos de metadata de app/, pero este helper vive en lib/. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          alt=""
          width={OG_SIZE.width}
          height={OG_SIZE.height}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* Scrim de protección */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(105deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.72) 38%, rgba(10,10,10,0.30) 72%, rgba(10,10,10,0.55) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(0deg, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0) 48%)",
          }}
        />

        {/* Contenido */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: 72,
          }}
        >
          {/* Eyebrow: marca + nombre */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <Bars unit={11} />
            <div style={{ marginLeft: 20, fontFamily: "Mono", fontSize: 24, letterSpacing: 5, color: GOLD }}>
              FOTF STUDIOS
            </div>
          </div>

          {/* Bloque inferior: titular + pie */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontFamily: "Display",
                fontSize: opts.fontSize ?? 126,
                lineHeight: 0.88,
                letterSpacing: -1,
                textTransform: "uppercase",
              }}
            >
              <div style={{ color: BONE }}>{opts.lines[0]}</div>
              <div style={{ color: GOLD }}>{opts.lines[1]}</div>
            </div>

            {/* Hairline + pie */}
            <div style={{ display: "flex", height: 1, backgroundColor: "rgba(245,242,236,0.18)", marginTop: 38 }} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 22,
                fontFamily: "Mono",
                fontSize: 23,
                letterSpacing: 3,
              }}
            >
              <div style={{ color: BONE_DIM }}>{opts.footLeft}</div>
              <div style={{ color: BONE }}>{opts.footRight ?? "FOTFSTUDIOS.CL"}</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Display", data: display, weight: 900, style: "normal" },
        { name: "Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
