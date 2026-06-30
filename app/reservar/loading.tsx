import Skeleton from "@/components/booking/Skeleton";

/** Shell skeleton mientras el server component carga el recurso de /reservar. */
export default function Loading() {
  return (
    <main role="status" aria-label="Cargando la reserva" className="mx-auto max-w-5xl px-6 py-20 md:py-28">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-10 h-3 w-16" />
      <Skeleton className="mt-3 h-12 w-72 md:h-16" />
      <Skeleton className="mt-4 h-5 w-full max-w-md" />

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        {/* Izquierda */}
        <div className="space-y-6">
          {/* Barra de sesión */}
          <div className="grid gap-6 border hairline p-5 sm:grid-cols-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>

          {/* Calendario + horarios */}
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <div className="border hairline p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="size-9" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="size-9" />
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 42 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square" />
                ))}
              </div>
            </div>
            <div className="border hairline p-4 md:min-h-[20rem] md:p-5">
              <Skeleton className="mb-4 h-3 w-40" />
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[2.85rem] w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Derecha: resumen */}
        <div className="border hairline bg-ink p-6 md:p-8">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-12 w-44 md:h-14" />
          <Skeleton className="mt-8 h-12 w-full" />
          <Skeleton className="mt-3 h-3 w-56" />
        </div>
      </div>

      <span className="sr-only">Cargando la reserva…</span>
    </main>
  );
}
