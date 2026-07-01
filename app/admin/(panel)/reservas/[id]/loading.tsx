import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonCard } from "@/components/admin/ui/skeletons";

/** Fallback del detalle de reserva: migas + encabezado + dos columnas de tarjetas. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando la reserva">
      <Skeleton className="h-3 w-40" />
      <div className="mt-4 border-b hairline pb-6">
        <Skeleton className="h-10 w-72 md:h-12" />
        <Skeleton className="mt-3 h-4 w-28" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <SkeletonCard lines={2} />
          <div className="grid gap-6 sm:grid-cols-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
