/** Fila clave/valor para datos duros dentro de la prosa: "Mixer · Pioneer DJM-450". */
export function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="mt-3 flex items-baseline justify-between gap-6 border-t hairline pt-3">
      <span className="label text-bone-mute">{k}</span>
      <span className="text-bone">{v}</span>
    </div>
  );
}
