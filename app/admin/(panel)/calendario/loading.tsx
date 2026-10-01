import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/calendario: encabezado + conexión + cola. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando Google Calendar">
      <SkeletonPageHeader />
      <div className="mt-8 flex flex-col gap-6">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={4} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
