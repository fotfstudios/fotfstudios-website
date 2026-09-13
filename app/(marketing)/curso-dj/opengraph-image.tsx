import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const alt = "Curso de DJ en Viña del Mar — FOTF Studios";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0a0a0a";
const BONE = "#f5f2ec";
const BONE_DIM = "#b9b5ab";
const GOLD = "#e8c94a";

export default async function Image() {
  const root = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(root, p));

  const photoSrc = `data:image/jpeg;base64,${read("public/photos/cabina-7.JPG").toString("base64")}`;
  const display = read("app/_fonts/BigShoulders-900.ttf");
  const mono = read("app/_fonts/JetBrainsMono-500.ttf");

  const Bars = ({ unit }: { unit: number }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: unit * 0.18, width: unit * 4.6 }}>
      {[100, 50, 75, 37.5].map((w, i) => (
        <div key={i} style={{ height: unit, width: `${w}%`, backgroundColor: GOLD, borderRadius: 2 }} />
      ))}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", backgroundColor: INK }}>
        <img
          src={photoSrc}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
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
          <div style={{ display: "flex", alignItems: "center" }}>
            <Bars unit={11} />
            <div
              style={{
                marginLeft: 20,
                fontFamily: "Mono",
                fontSize: 24,
                letterSpacing: 5,
                color: GOLD,
              }}
            >
              FOTF STUDIOS
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontFamily: "Display",
                fontSize: 126,
                lineHeight: 0.88,
                letterSpacing: -1,
                textTransform: "uppercase",
              }}
            >
              <div style={{ color: BONE }}>Curso de DJ</div>
              <div style={{ color: GOLD }}>en Viña del Mar</div>
            </div>

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
              <div style={{ color: BONE_DIM }}>4 SESIONES · SET FINAL GRABADO · DESDE $79.990</div>
              <div style={{ color: BONE }}>FOTFSTUDIOS.CL</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Display", data: display, weight: 900, style: "normal" },
        { name: "Mono", data: mono, weight: 500, style: "normal" },
      ],
    }
  );
}
