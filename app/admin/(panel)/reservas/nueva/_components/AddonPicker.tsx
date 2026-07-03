import { formatCLP } from "@/src/domain/money/money";

export interface CatalogAddon {
  key: string;
  name: string;
  amount: number;
  kind: "flat_service" | "per_hour";
}

/** Extras del price book: grabación (elige una) + guía por hora (toggle). */
export function AddonPicker({
  addons,
  rec,
  extras,
  onRec,
  onToggleExtra,
}: {
  addons: CatalogAddon[];
  rec: string;
  extras: string[];
  onRec: (key: string) => void;
  onToggleExtra: (key: string) => void;
}) {
  const recording = addons.filter((a) => a.kind === "flat_service");
  const hourly = addons.filter((a) => a.kind === "per_hour");

  return (
    <div className="flex flex-col gap-5">
      {recording.length > 0 && (
        <div>
          <span className="label-sm text-bone-mute">Grabación (elige una)</span>
          <div className="mt-2.5 space-y-1.5">
            <OptionButton active={rec === "none"} onClick={() => onRec("none")} label="Sin grabación" />
            {recording.map((a) => (
              <OptionButton
                key={a.key}
                active={rec === a.key}
                onClick={() => onRec(a.key)}
                label={a.name}
                delta={`+${formatCLP(a.amount)}`}
              />
            ))}
          </div>
        </div>
      )}

      {hourly.length > 0 && (
        <div>
          <span className="label-sm text-bone-mute">Guía</span>
          <div className="mt-2.5 space-y-1.5">
            {hourly.map((a) => (
              <OptionButton
                key={a.key}
                active={extras.includes(a.key)}
                onClick={() => onToggleExtra(a.key)}
                label={a.name}
                delta={`+${formatCLP(a.amount)}/h`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  label,
  delta,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  delta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center justify-between gap-3 border px-4 py-3 text-left label-sm transition-colors outline-none focus-visible:ring-1 focus-visible:ring-gold ${
        active ? "border-gold bg-gold text-ink" : "hairline text-bone-dim hover:border-gold hover:text-gold"
      }`}
    >
      <span>{label}</span>
      {delta && <span className="font-mono">{delta}</span>}
    </button>
  );
}
