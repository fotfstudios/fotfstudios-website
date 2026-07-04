import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/**
 * Fallback de /admin/agenda: encabezado + toolbar + grilla horaria genérica
 * (sesgada a la vista semana, la default — loading.tsx no puede leer ?v=).
 * Offsets deterministas: nada de Math.random, que rompería el streaming.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando la agenda">
      <SkeletonPageHeader action />
      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid border hairline" style={{ gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))" }}>
        <div className="border-b hairline" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-b border-l hairline px-2.5 py-2">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="mt-1 h-5 w-5" />
          </div>
        ))}
        <div className="h-96" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="relative h-96 border-l hairline">
            {i % 3 !== 2 && (
              <div className="absolute inset-x-1" style={{ top: 24 + (i % 4) * 88 }}>
                <Skeleton className="h-14 w-full" />
              </div>
            )}
            {i % 2 === 0 && (
              <div className="absolute inset-x-1" style={{ top: 180 + (i % 3) * 60 }}>
                <Skeleton className="h-14 w-full" />
              </div>
            )}
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
