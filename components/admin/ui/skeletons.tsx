import { DataTable, Td, Th, Tr } from "./DataTable";
import { Skeleton } from "./Skeleton";

/** Encabezado (kicker · título · línea editorial) en skeleton, calcado de `PageHeader`. */
export function SkeletonPageHeader({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-10 w-56 md:h-12 md:w-72" />
        <Skeleton className="mt-3 h-4 w-48" />
      </div>
      {action && <Skeleton className="h-10 w-36" />}
    </div>
  );
}

/** Tabla en skeleton reutilizando el mismo shell de `DataTable` (misma grilla/hairlines). */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <DataTable
      head={Array.from({ length: cols }).map((_, i) => (
        <Th key={i}>
          <Skeleton className="h-3 w-16" />
        </Th>
      ))}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <Tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <Td key={c}>
              <Skeleton className={`h-4 ${c === 0 ? "w-28" : "w-20"}`} />
            </Td>
          ))}
        </Tr>
      ))}
    </DataTable>
  );
}

/** Grilla de tarjetas KPI en skeleton, calcada del `Stat` del dashboard. */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border hairline bg-ink/40 p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Tarjeta genérica en skeleton (título + N líneas), calcada de `Card`. */
export function SkeletonCard({ className = "", lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`border hairline p-5 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
