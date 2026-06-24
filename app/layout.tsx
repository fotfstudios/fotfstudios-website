import type { Metadata, Viewport } from "next";
import { Big_Shoulders, JetBrains_Mono, Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CustomCursor from "@/components/CustomCursor";
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

const SITE = "https://fotfstudios.cl";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
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
    url: SITE,
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
        <div className="scroll-meter" aria-hidden />
        <CustomCursor />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
