import MeterBars from "./MeterBars";

const DEFAULT_ITEMS = [
  "Sala de ensayo de DJ",
  "Por hora",
  "Aislada acústicamente",
  "Acceso autogestionado",
  "Plug & play",
  "2× Pioneer XDJ-1000MK2",
  "Pioneer DJM-450",
  "Monitores VM-50",
  "Viña del Mar",
  "El pulso, documentado",
];

function Sequence({ items, hidden = false }: { items: string[]; hidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i} className="flex items-center">
          <span className="label px-7 text-bone-dim">{t}</span>
          <span className="h-1.5 w-1.5 rotate-45 bg-gold" />
        </span>
      ))}
    </div>
  );
}

/**
 * Cinta de transmisión: ritmo constante, como el four-on-the-floor.
 * Loop sin costura (dos secuencias, animación a -50%). Pausa al pasar el cursor.
 */
export default function Ticker({
  items = DEFAULT_ITEMS,
  reverse = false,
}: {
  items?: string[];
  reverse?: boolean;
}) {
  return (
    <div className="group relative flex items-center overflow-hidden border-y hairline bg-ink-soft/50 py-4">
      <MeterBars className="absolute left-5 z-10 hidden text-[13px] text-gold md:flex" />
      {/* Difuminados laterales para que la cinta entre y salga del Ink */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-24 bg-gradient-to-r from-ink to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-24 bg-gradient-to-l from-ink to-transparent"
      />
      <div className={`ticker-track ${reverse ? "ticker-rev" : ""}`}>
        <Sequence items={items} />
        <Sequence items={items} hidden />
      </div>
    </div>
  );
}
