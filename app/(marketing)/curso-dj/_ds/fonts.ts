import localFont from "next/font/local";

/**
 * Tipografías del design system de Claude Design para /curso-dj. Se cargan SOLO
 * aquí: las variables se aplican en el wrapper `.curso-ds` de la página, no en
 * <html>, así el resto del sitio sigue con Big Shoulders / JetBrains Mono.
 * lib/chrome-contract.test.ts impide que salgan de app/(marketing)/curso-dj.
 *
 * Autoalojadas (./fonts, subset latin de Google Fonts, licencia SIL OFL) y no con
 * el loader de Google de next/font: Google a veces sirve estas familias con URLs sin extensión
 * (`/l/font?kit=…`) y el loader de Next revienta el build ("Cannot read properties
 * of null (reading '1')") — pasó en CI con #223. Local = build determinista.
 */
const anton = localFont({
  src: "./fonts/anton-400.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-ds-display",
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

const spaceGrotesk = localFont({
  // Variable: un solo archivo cubre 300–500.
  src: "./fonts/space-grotesk-300-500.woff2",
  weight: "300 500",
  display: "swap",
  variable: "--font-ds-body",
  fallback: ["system-ui", "sans-serif"],
});

const spaceMono = localFont({
  src: [
    { path: "./fonts/space-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/space-mono-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-ds-mono",
  fallback: ["ui-monospace", "monospace"],
});

export const cursoDsFonts = `${anton.variable} ${spaceGrotesk.variable} ${spaceMono.variable}`;
