import Skeleton from "@/components/booking/Skeleton";
import { dsFonts } from "@/components/ds/fonts";
import "@/components/ds/ds.css";

/** Esqueleto del checkout (mismo layout que el widget) mientras el server resuelve el recurso. */
export default function Loading() {
  return (
    <div className={`fotf-ds ${dsFonts} min-h-screen`}>
      <main role="status" aria-label="Cargando la reserva" className="mx-auto w-full max-w-[1200px] px-4 pt-10 pb-16 sm:px-10">
        <Skeleton className="h-3 w-28" />
        <div className="mt-8 mb-10 flex max-w-[640px] flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-12 w-72 md:h-16" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="grid items-start gap-10 min-[860px]:grid-cols-[minmax(0,1.5fr)_360px]">
          <div className="flex flex-col gap-11">
            {/* Duración */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[74px] rounded-[6px]" />
              ))}
            </div>
            {/* Tira de días + grilla */}
            <div className="flex flex-col gap-6">
              <div className="flex gap-1.5 overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-[76px] w-16 shrink-0 rounded-[6px]" />
                ))}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-[58px] rounded-[6px]" />
                ))}
              </div>
            </div>
          </div>
          {/* Resumen */}
          <div className="hidden flex-col gap-4 rounded-[10px] border border-[var(--border-subtle)] p-6 min-[860px]:flex">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
        <span className="sr-only">Cargando la reserva…</span>
      </main>
    </div>
  );
}
