import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const alt = "FOTF Studios — Sala de ensayo de DJ por hora en Viña del Mar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const root = process.cwd();
  const photo = fs
    .readFileSync(path.join(root, "public/photos/hero-booth.JPG"))
    .toString("base64");
  const logo = fs
    .readFileSync(path.join(root, "public/logo/fotf-lockup-gold.svg"))
    .toString("base64");
  const photoSrc = `data:image/jpeg;base64,${photo}`;
  const logoSrc = `data:image/svg+xml;base64,${logo}`;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0a0a0a",
        }}
      >
        {/* Foto de cabina */}
        <img
          src={photoSrc}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* Scrim de protección (izquierda + abajo) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(10,10,10,0.94) 0%, rgba(10,10,10,0.6) 42%, rgba(10,10,10,0.15) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(0deg, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0) 55%)",
          }}
        />
        {/* Overlay de marca */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            height: "100%",
            padding: "64px 72px",
          }}
        >
          <img
            src={logoSrc}
            alt=""
            width={340}
            height={340}
            style={{ width: 340, height: 340, marginLeft: -8, marginBottom: -36 }}
          />
          <div style={{ fontSize: 36, color: "#f5f2ec", letterSpacing: "0.01em" }}>
            Sala de ensayo de DJ por hora · Viña del Mar
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
