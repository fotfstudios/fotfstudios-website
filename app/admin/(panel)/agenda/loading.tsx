import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/agenda: encabezado + navegación + grilla de 7 días. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando la agenda">
      <SkeletonPageHeader />
      <div className="mt-8 mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-2 md:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border hairline">
            <div className="border-b hairline bg-ink/40 px-3 py-2">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="mt-1 h-5 w-6" />
            </div>
            <div className="flex flex-col gap-1.5 p-2 md:min-h-36">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
