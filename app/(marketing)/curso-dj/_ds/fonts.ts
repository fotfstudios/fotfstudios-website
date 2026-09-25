import { Anton, Space_Grotesk, Space_Mono } from "next/font/google";

/**
 * Tipografías del design system de Claude Design para /curso-dj. Se cargan SOLO
 * aquí: las variables se aplican en el wrapper `.curso-ds` de la página, no en
 * <html>, así el resto del sitio sigue con Big Shoulders / JetBrains Mono.
 * lib/chrome-contract.test.ts impide importarlas fuera de app/(marketing)/curso-dj.
 */
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ds-display",
});

const spaceGrotesk = Space_Grotesk({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ds-body",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ds-mono",
});

export const cursoDsFonts = `${anton.variable} ${spaceGrotesk.variable} ${spaceMono.variable}`;
