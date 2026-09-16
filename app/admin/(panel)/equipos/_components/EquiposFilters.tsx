"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/admin/ui/Field";
import { type EquiposListQuery, ESTADO_FILTERS, equiposHref } from "@/src/domain/admin/equipos-list";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_KEYS, EQUIPMENT_STATUSES } from "@/src/domain/equipment/equipment";

const ESTADO_LABEL: Record<(typeof ESTADO_FILTERS)[number], string> = {
  activos: "Activos",
  ...EQUIPMENT_STATUSES,
};

/** Dos selects que reescriben la URL (el estado de la lista vive ahí, como en clientes). */
export function EquiposFilters({ query }: { query: EquiposListQuery }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-44">
        <Select
          aria-label="Filtrar por categoría"
          value={query.categoria}
          onChange={(e) => router.replace(equiposHref(query, { categoria: e.target.value as EquiposListQuery["categoria"] }))}
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
          value={query.estado}
          onChange={(e) => router.replace(equiposHref(query, { estado: e.target.value as EquiposListQuery["estado"] }))}
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
