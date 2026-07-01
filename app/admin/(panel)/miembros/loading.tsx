import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/miembros: encabezado + tabla de miembros. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando miembros">
      <SkeletonPageHeader action />
      <div className="mt-8">
        <SkeletonTable rows={5} cols={4} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
