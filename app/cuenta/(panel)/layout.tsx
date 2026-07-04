import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import CuentaShell from "@/components/cuenta/CuentaShell";
import { accountEnabled } from "@/lib/flags";
import { customerService } from "@/src/composition";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const metadata: Metadata = { title: "Mi cuenta — FOTF Studios", robots: { index: false } };

/**
 * Grupo autenticado de /cuenta: exige sesión (defensa además del middleware),
 * asegura el perfil (+ puntos retroactivos del historial — idempotente) y monta
 * el shell con el chip de saldo. Único choke point de "el cliente entró".
 */
export default async function CuentaLayout({ children }: { children: ReactNode }) {
  if (!accountEnabled()) notFound();
  const session = await requireCustomer();

  const svc = customerService();
  await svc.ensureCustomer(session.userId, session.email);
  const profile = await svc.profile(session.userId);

  return <CuentaShell balance={profile?.pointsBalance ?? 0}>{children}</CuentaShell>;
}
