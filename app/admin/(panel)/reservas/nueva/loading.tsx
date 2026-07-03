import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/reservas/nueva: encabezado + consola en dos columnas. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando la consola de reserva">
      <SkeletonPageHeader />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <div className="border hairline p-5">
            <Skeleton className="h-3 w-24" />
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <Skeleton className="h-72 w-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-12 w-full" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          </div>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </div>
        <SkeletonCard lines={8} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
