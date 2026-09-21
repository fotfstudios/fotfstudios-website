"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/admin/ui/Field";
import { type EquiposListQuery, ESTADO_FILTERS } from "@/src/domain/admin/equipos-list";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_KEYS, EQUIPMENT_STATUSES } from "@/src/domain/equipment/equipment";

const ESTADO_LABEL: Record<(typeof ESTADO_FILTERS)[number], string> = {
  activos: "Activos",
  ...EQUIPMENT_STATUSES,
};

/**
 * Dos selects que reescriben la URL (el estado de la lista vive ahí, como en clientes).
 * Mismo patrón que SortSelect: estado optimista + useTransition, para que el <select>
 * controlado no "rebote" al valor viejo mientras espera el round trip del RSC, y la URL se
 * arma desde `window.location.search` (no del `query` cerrado por el render) para no perder
 * un `q` recién tipeado durante el debounce de SearchBox.
 */
export function EquiposFilters({ query }: { query: EquiposListQuery }) {
  const router = useRouter();
  const [pendingCat, startCat] = useTransition();
  const [chosenCat, setChosenCat] = useState<EquiposListQuery["categoria"] | null>(null);
  const [pendingEstado, startEstado] = useTransition();
  const [chosenEstado, setChosenEstado] = useState<EquiposListQuery["estado"] | null>(null);

  const navigate = (mutate: (sp: URLSearchParams) => void, start: (fn: () => void) => void) => {
    const sp = new URLSearchParams(window.location.search);
    mutate(sp);
    sp.delete("p");
    const qs = sp.toString();
    start(() => router.replace(`/admin/equipos${qs ? `?${qs}` : ""}`, { scroll: false }));
  };

  const onCategoria = (categoria: EquiposListQuery["categoria"]) => {
    setChosenCat(categoria);
    navigate((sp) => (categoria ? sp.set("cat", categoria) : sp.delete("cat")), startCat);
  };

  const onEstado = (estado: EquiposListQuery["estado"]) => {
    setChosenEstado(estado);
    navigate((sp) => (estado !== "activos" ? sp.set("estado", estado) : sp.delete("estado")), startEstado);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-44">
        <Select
          aria-label="Filtrar por categoría"
          value={pendingCat && chosenCat !== null ? chosenCat : query.categoria}
          onChange={(e) => onCategoria(e.target.value as EquiposListQuery["categoria"])}
          aria-busy={pendingCat}
        >
          <option value="">Todas las categorías</option>
          {EQUIPMENT_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {EQUIPMENT_CATEGORIES[k]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-44">
        <Select
          aria-label="Filtrar por estado"
          value={pendingEstado && chosenEstado !== null ? chosenEstado : query.estado}
          onChange={(e) => onEstado(e.target.value as EquiposListQuery["estado"])}
          aria-busy={pendingEstado}
        >
          {ESTADO_FILTERS.map((k) => (
            <option key={k} value={k}>
              {ESTADO_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
