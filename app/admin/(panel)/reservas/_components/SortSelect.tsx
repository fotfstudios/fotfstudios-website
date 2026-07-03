"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/admin/ui/Field";
import type { ReservaOrden } from "@/src/domain/admin/reservas-list";

/** Orden de la lista vía `?orden=` (resetea la página, conserva el resto de filtros). */
export function SortSelect({ value }: { value: ReservaOrden }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const onChange = (orden: string) => {
    const sp = new URLSearchParams(searchParams);
    if (orden === "fecha") sp.delete("orden");
    else sp.set("orden", orden);
    sp.delete("p");
    const qs = sp.toString();
    startTransition(() => router.replace(`/admin/reservas${qs ? `?${qs}` : ""}`, { scroll: false }));
  };

  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Ordenar reservas"
      className="max-w-44"
    >
      <option value="fecha">Fecha de sesión</option>
      <option value="monto">Mayor monto</option>
      <option value="creacion">Creadas recién</option>
    </Select>
  );
}
