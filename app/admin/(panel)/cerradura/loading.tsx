import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/cerradura: encabezado + dos cards con filas de PIN. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando cerradura">
      <SkeletonPageHeader />
      {[0, 1].map((k) => (
        <div key={k} className="mt-8 border hairline p-5">
          <Skeleton className="h-4 w-28" />
          <div className="mt-5 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-7 w-28" />
                  <Skeleton className="h-9 w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
