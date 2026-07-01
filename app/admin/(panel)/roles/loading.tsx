import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/roles: encabezado + tarjetas de rol. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando roles">
      <SkeletonPageHeader />
      <div className="mt-8 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
