import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Tile Ink + barras gold (misma proporción que app/icon.svg: 100/50/75/37.5%)
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          borderRadius: 36,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 108 }}>
          {[100, 50, 75, 37.5].map((w, i) => (
            <div
              key={i}
              style={{ height: 22, width: `${w}%`, backgroundColor: "#e8c94a", borderRadius: 3 }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
