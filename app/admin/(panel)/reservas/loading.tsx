import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/reservas: encabezado + barra de filtros/búsqueda + tabla. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando reservas">
      <SkeletonPageHeader action />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b hairline pb-3">
        <div className="flex gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="mt-4">
        <SkeletonTable rows={8} cols={5} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
