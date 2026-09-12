import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Big_Shoulders, JetBrains_Mono, Fraunces } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { buildConsentDefaultScript } from "@/lib/consent";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-big-shoulders",
  display: "swap",
  adjustFontFallback: false,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FOTF Studios · Sala de ensayo de DJ por hora · Viña del Mar",
    template: "%s · FOTF Studios",
  },
  description:
    "Sala de ensayo de DJ por hora en Viña del Mar. Aislada acústicamente, equipo Pioneer y monitores de estudio. Plug & play, acceso autogestionado. Reserva una hora y entra a tocar.",
  keywords: [
    "sala de ensayo DJ",
    "ensayo DJ Viña del Mar",
    "arriendo sala DJ por hora",
    "cabina DJ Valparaíso",
    "Pioneer XDJ",
    "FOTF Studios",
  ],
  authors: [{ name: "FOTF Studios" }],
  openGraph: {
    title: "FOTF Studios · Sala de ensayo de DJ por hora",
    description:
      "Aislada acústicamente en Viña del Mar. Plug & play, acceso autogestionado. Reserva una hora y entra a tocar.",
    url: SITE_URL,
    siteName: "FOTF Studios",
    locale: "es_CL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FOTF Studios · Sala de ensayo de DJ por hora",
    description: "Aislada acústicamente en Viña del Mar. Reserva una hora y entra a tocar.",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-CL"
      className={`${bigShoulders.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/*
          Google Consent Mode v2 — defaults antes de cualquier tag.
          INVARIANTE (nadie la vigila): el Script beforeInteractive solo funciona en ESTE
          root layout — Next drena self.__next_s una sola vez antes de hidratar, y un
          Script así en un layout de grupo puede no correr nunca, en silencio. Ni tsc,
          ni "eslint ." (la regla de @next salta todo app/), ni vitest, ni el build lo
          detectan; solo lib/chrome-contract.test.ts afirma que el atributo vive aquí y
          en ningún otro .tsx. El loader de GTM, el banner de consentimiento y Vercel
          Analytics viven en components/PublicChrome.tsx (marketing, booking, cuenta y
          la 404) — nunca bajo /admin. Aquí solo queda lo que debe ser global.
        */}
        <Script id="consent-default" strategy="beforeInteractive">
          {buildConsentDefaultScript()}
        </Script>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
