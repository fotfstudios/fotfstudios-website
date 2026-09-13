import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import ConsentBanner from "@/components/ConsentBanner";

// GA4 (G-5K07LY6W3N) se sirve vía este contenedor GTM — no agregar gtag.js aparte (duplicaría la medición).
const GTM_ID = "GTM-WCC3V22R";

/**
 * Medición del sitio público: loader de GTM (+ noscript), banner de consentimiento
 * y Vercel Analytics. Lo montan app/(marketing)/layout.tsx, app/(booking)/layout.tsx,
 * app/cuenta/layout.tsx y app/not-found.tsx (las 404 se renderizan solo con el root
 * layout, sin layout de grupo). NUNCA bajo app/admin: el panel no se mide.
 *
 * <Analytics /> viaja aquí y no solo en marketing porque /reserva/estado y
 * /cuenta/reservas disparan trackWhatsAppClick (lib/analytics.ts) y track() es un
 * no-op silencioso si el tag no está montado.
 *
 * Los defaults de Consent Mode v2 (consent-default, beforeInteractive) siguen en
 * app/layout.tsx — ver el comentario ahí; el orden consent-default → gtm-init lo
 * garantiza la estrategia, no la posición en el árbol.
 *
 * Cada URL debe caer bajo UN solo punto de montaje: next/script deduplica gtm-init
 * por id (LoadCache global al módulo) y @vercel/analytics no reinyecta su tag, pero
 * un ConsentBanner doble sí se vería. lib/chrome-contract.test.ts vigila quién monta qué.
 */
export default function PublicChrome() {
  return (
    <>
      {/* Google Tag Manager (noscript) */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
      {/* Google Tag Manager */}
      <Script id="gtm-init" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <Analytics />
      <ConsentBanner />
    </>
  );
}
