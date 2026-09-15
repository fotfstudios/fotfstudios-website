import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/sii: encabezado + tres grupos de pendientes. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando documentos por emitir">
      <SkeletonPageHeader action />
      <div className="mt-8 flex flex-col gap-6">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
