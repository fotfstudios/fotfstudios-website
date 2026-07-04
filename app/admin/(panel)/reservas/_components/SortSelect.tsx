"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/admin/ui/Field";
import type { ReservaOrden } from "@/src/domain/admin/reservas-list";

/**
 * Orden de la lista vía `?orden=` (resetea la página, conserva el resto).
 * Mientras navega muestra la opción elegida (optimista) — sin eso el select
 * controlado "rebotaría" al valor viejo hasta que el server responda.
 */
export function SortSelect({ value }: { value: ReservaOrden }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<ReservaOrden | null>(null);

  const onChange = (orden: ReservaOrden) => {
    setChosen(orden);
    const sp = new URLSearchParams(window.location.search);
    if (orden === "fecha") sp.delete("orden");
    else sp.set("orden", orden);
    sp.delete("p");
    const qs = sp.toString();
    startTransition(() => router.replace(`/admin/reservas${qs ? `?${qs}` : ""}`, { scroll: false }));
  };

  return (
    <Select
      value={pending && chosen ? chosen : value}
      onChange={(e) => onChange(e.target.value as ReservaOrden)}
      aria-label="Ordenar reservas"
      aria-busy={pending}
      className="max-w-44"
    >
      <option value="fecha">Fecha de sesión</option>
      <option value="monto">Mayor monto</option>
      <option value="creacion">Creadas recién</option>
    </Select>
  );
}
