"use client";

import { memo, useCallback, useRef, useState } from "react";
import { initMercadoPago, Wallet } from "@mercadopago/sdk-react";
import Skeleton from "./Skeleton";

/** Único punto de decisión visual del dueño: 'default' (azul MP) | 'black' | 'white'. */
const BUTTON_BACKGROUND = "default" as const;

// Constantes de módulo: identidad estable. El efecto interno del <Wallet> depende
// de [customization, initialization, onReady, onError, onSubmit] — cualquier
// identidad nueva desmonta y re-inicializa el brick (verificado en sdk-react@1.0.7),
// por eso TODAS sus props deben ser estables.
const CUSTOMIZATION = {
  valueProp: "security_safety",
  // valuePropColor white: el texto bajo el botón debe leerse sobre fondo Ink.
  customStyle: { buttonBackground: BUTTON_BACKGROUND, valuePropColor: "white" },
} as const;
// Paridad con el redirect clásico (window.location.assign): misma pestaña.
const INITIALIZATION = { redirectMode: "self" } as const;

// Init una sola vez por carga del bundle. El módulo solo se evalúa en el browser
// (next/dynamic ssr:false); el guard de window es cinturón y tirantes. A nivel de
// módulo queda inmune al doble-invoke de StrictMode (reactStrictMode: true).
const PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? "";
if (typeof window !== "undefined" && PUBLIC_KEY) {
  initMercadoPago(PUBLIC_KEY, { locale: "es-CL" });
}

/**
 * Wallet Brick de Mercado Pago (variante PreferenceOnSubmit): el hold/orden/
 * preference se crean recién al CLICK vía `onSubmit`, que resuelve el
 * preferenceId — nunca antes (no tomar holds de visitantes). Aislado del
 * re-render por tecleo del BookingWidget: memo + constantes + callbacks por ref.
 */
export default memo(function MpWalletButton({
  onSubmit,
  onFallback,
  className = "",
}: {
  /** Crea la reserva y resuelve el preferenceId de MP; rechaza con el error mapeado. */
  onSubmit: () => Promise<string>;
  /** El brick no pudo cargar/operar → el caller vuelve al botón clásico. */
  onFallback: () => void;
  className?: string;
}) {
  const [ready, setReady] = useState(false);

  // El brick captura funciones estables; estas delegan siempre en las más recientes.
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;

  const stableSubmit = useRef(() => onSubmitRef.current()).current;
  const stableReady = useCallback(() => setReady(true), []);
  const stableError = useRef((e: unknown) => {
    console.error("[mp-wallet]", e);
    onFallbackRef.current();
  }).current;

  return (
    <div className={className}>
      {!ready && (
        <>
          <Skeleton className="h-12 w-full" />
          <span className="sr-only">Cargando el botón de pago…</span>
        </>
      )}
      {/* Mantener el brick en el DOM (alto 0) para que onReady dispare. */}
      <div className={ready ? "" : "h-0 overflow-hidden"}>
        <Wallet
          initialization={INITIALIZATION}
          customization={CUSTOMIZATION}
          locale="es-CL"
          onSubmit={stableSubmit}
          onReady={stableReady}
          onError={stableError}
        />
      </div>
    </div>
  );
});
