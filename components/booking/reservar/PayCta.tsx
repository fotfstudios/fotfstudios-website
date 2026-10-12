"use client";

import dynamic from "next/dynamic";
import Button from "@/components/ds/Button";

// SDK de MP solo en el browser y solo cuando el brick monta (todo listo para pagar).
const MpWalletButton = dynamic(() => import("../MpWalletButton"), { ssr: false });

/**
 * ÚNICO lugar que decide el botón de pago:
 *  - falta algo → botón que nombra lo que falta (tras un intento) y lleva ahí;
 *  - Beatcoins cubren el total → "Pagar con Beatcoins" (sin paso de pago);
 *  - eligió transferencia (respaldo si MP falla) → reserva y lleva a los datos bancarios;
 *  - Wallet Brick de MP si hay public key y no falló → el brick (crea el pedido al click);
 *  - si no, redirect clásico a Checkout Pro.
 * El brick solo monta con todo listo: nunca se toma un hold por visitar la página.
 */
export default function PayCta({
  label,
  ready,
  fullPoints,
  submitting,
  walletEnabled,
  glow,
  onBlocked,
  onClassic,
  onPoints,
  onWallet,
  onWalletFallback,
  transfer = false,
  onTransfer,
}: {
  label: string;
  ready: boolean;
  fullPoints: boolean;
  submitting: boolean;
  walletEnabled: boolean;
  glow: boolean;
  onBlocked: () => void;
  onClassic: () => void;
  onPoints: () => void;
  onWallet: () => Promise<string>;
  onWalletFallback: () => void;
  transfer?: boolean;
  onTransfer?: () => void;
}) {
  if (!ready) {
    return (
      <Button fullWidth onClick={onBlocked} disabled={submitting}>
        {label}
      </Button>
    );
  }
  if (fullPoints) {
    return (
      <Button fullWidth glow={glow} onClick={onPoints} disabled={submitting}>
        {label}
      </Button>
    );
  }
  if (transfer && onTransfer) {
    return (
      <Button fullWidth glow={glow} onClick={onTransfer} disabled={submitting}>
        {label}
      </Button>
    );
  }
  if (walletEnabled) {
    return <MpWalletButton onSubmit={onWallet} onFallback={onWalletFallback} />;
  }
  return (
    <Button fullWidth glow={glow} onClick={onClassic} disabled={submitting}>
      {label}
    </Button>
  );
}
