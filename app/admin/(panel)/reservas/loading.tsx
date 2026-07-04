import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonStatGrid, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/reservas: encabezado + KPIs + filtros/búsqueda + tabla + paginación. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando reservas">
      <SkeletonPageHeader action />
      <div className="mt-8">
        <SkeletonStatGrid />
      </div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b hairline pb-3">
        <div className="flex gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
      <div className="mt-4">
        <SkeletonTable rows={8} cols={5} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-9 w-44" />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
