import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/equipos: encabezado + búsqueda/filtros + tabla + paginación. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando equipos">
      <SkeletonPageHeader action />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-44" />
        </div>
      </div>
      <div className="mt-4">
        <SkeletonTable rows={8} cols={7} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-9 w-44" />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
