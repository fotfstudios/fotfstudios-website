"use client";

import Link from "next/link";
import { btn } from "@/components/admin/ui/styles";
import { fmtPts } from "@/components/cuenta/format";
import { customerLabel } from "@/src/domain/customers/customer-input";
import type { CustomerProfile } from "@/src/application/ports/customers";

export interface CustomerSummaryProps {
  customer: CustomerProfile;
  onChange: () => void;
  onClear: () => void;
  /** "Ver ficha" solo aparece con `customers.manage`: si no, el destino da 403. */
  canManageCustomers?: boolean;
}

/** El cliente ya elegido: quién es, qué contacto quedará en la reserva y sus puntos. */
export function CustomerSummary({ customer, onChange, onClear, canManageCustomers }: CustomerSummaryProps) {
  const contacto = [customer.email, customer.phone].filter(Boolean).join(" · ");
  return (
    <div className="border hairline p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-bone">{customerLabel(customer)}</span>
        {customer.pointsBalance > 0 && (
          <span className="label-sm text-gold">{fmtPts(customer.pointsBalance)} pts</span>
        )}
      </div>
      <p className="mt-0.5 font-mono text-xs text-bone-dim">{contacto || "Sin contacto"}</p>
      {customer.authUserId && <p className="mt-0.5 label-sm text-bone-mute">Con cuenta</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={btn("secondary", "sm")} onClick={onChange}>
          Cambiar
        </button>
        <button type="button" className={btn("ghost", "sm")} onClick={onClear}>
          Quitar
        </button>
        {/* Pestaña nueva: desde la consola, navegar en la misma tira la reserva a medio armar. */}
        {canManageCustomers && (
          <Link
            href={`/admin/clientes/${customer.id}`}
            target="_blank"
            rel="noopener"
            className="label-sm text-bone-mute underline"
          >
            Ver ficha ↗
          </Link>
        )}
      </div>
    </div>
  );
}
