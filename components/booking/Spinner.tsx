/** Spinner anillo dorado; bajo prefers-reduced-motion queda solo el texto. */
export default function Spinner() {
  return (
    <div role="status" className="flex min-h-[12rem] items-center justify-center gap-2 text-bone-mute">
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-graphite border-t-gold motion-reduce:hidden"
      />
      <span className="label-sm">Cargando disponibilidad…</span>
    </div>
  );
}
