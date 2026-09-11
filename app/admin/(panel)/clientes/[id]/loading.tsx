import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonCard } from "@/components/admin/ui/skeletons";

/** Fallback de la ficha de cliente: breadcrumb + encabezado + grid de cards. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando la ficha">
      <Skeleton className="h-3 w-40" />
      <div className="mt-4 border-b hairline pb-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-52" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
        </div>
        <div className="flex flex-col gap-6">
          <SkeletonCard lines={3} />
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
